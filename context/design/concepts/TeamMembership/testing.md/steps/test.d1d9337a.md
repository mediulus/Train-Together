---
timestamp: 'Wed Oct 15 2025 15:11:48 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251015_151148.a2b7135b.md]]'
content_id: d1d9337a702181d6505ef0ddba61e58857f901a02dcaabe3fe9960764bdbec40
---

# test:  TeamMembership

import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import UserDirectoryConcept, {
Role,
} from "../UserDirectory/UserDirectoryConcept.ts";

const PREFIX = "TeamMembership" + ".";

type UserId = ID;
type TeamID = ID;

export interface Team {
\_id: TeamID;
name: string;
passKey: string;
coach: UserId;
athletes: UserId\[];
}

/\*\*

* @concept TeamMembership
* @purpose Organize teams and their membership so coaches can create teams and athletes can join them.
* @principle After a coach creates a team with a unique name and passKey,
* ```
         athletes who know the passKey can join the team and remain members until they leave.
  ```

\*/
export default class TeamMembershipConcept {
private teams: Collection<Team>;
private userDirectory: UserDirectoryConcept;

constructor(private readonly db: Db, userDirectory?: UserDirectoryConcept) {
this.userDirectory = userDirectory ?? new UserDirectoryConcept(db);
this.teams = this.db.collection(PREFIX + "teams");
this.teams.createIndex({ name: 1 }, { unique: true }).catch((err) =>
console.error(
`Error creating unique index for TeamMembership.teams.name: ${err}`,
)
);

```
// Ensure a coach can only coach one team at a time.
this.teams.createIndex({ coach: 1 }, { unique: true }).catch((err) =>
  console.error(
    `Error creating unique index for TeamMembership.teams.coach: ${err}`,
  )
);
```

}

/\*\*

* Makes a new team
*
* @requires  No team with this name exists
* @requires coach exists and coach.role = coach
* @requires the coach does not coach another team
*
* @effects Generates a new team object with the provided title, coach, and passKey.
* ```
       The new team initially has an empty list of athletes.
  ```
*
* @param title  The desired name for the new team.
* @param coach The ID of the user who will coach this team.
* @param passKey The passKey required for athletes to join the team.
*
* @returns The ID of the new team on success
  \*/

async createTeam(
title: string,
coach: UserId,
passKey: string,
): Promise<{ newTeam: Team } | { error: string }> {
// verify user is a coach
const userRole = await this.userDirectory.getUserRole(coach);
if (userRole !== Role.Coach) {
return {
error:
`User with userId: ${coach} is not a coach and cannot make a team`,
};
}

```
// verify the coach does not already coach another team
const existingCoachTeam = await this.teams.findOne({ coach: coach });
if (existingCoachTeam) {
  return {
    error:
      `User with userId: ${coach} already coaches team "${existingCoachTeam.name}"`,
  };
}

// verify team does not exist
const existingTeam = await this.teams.findOne({ name: title });

if (existingTeam) {
  return { error: `Team with name "${title}" already exists.` };
}

//generate the new team
const newTeamID = freshID() as TeamID;

const newTeam: Team = {
  _id: newTeamID,
  name: title,
  coach: coach,
  passKey: passKey,
  athletes: [], // New teams start with no athletes
};

await this.teams.insertOne(newTeam);
return { newTeam: newTeam };
```

}

/\*\*

* Adds an athlete to the team
*
* @requires Team exists with this title
* @requires rovided passKey matches team's passKey.
* @requires athlete exists and athlete.role = athlete.
* @requires Athlete is not already a member of the team.
*
* @effects Adds the athlete's ID to the team's 'athletes' set.
*
* @param title The name of the team to which the athlete will be added.
* @param athlete The ID of the athlete to add.
* @param passKey The passKey required to join the team.
*
* @returns An empty object on success, or an error message.
  \*/

async addAthlete(
title: string,
athlete: UserId,
passKey: string,
): Promise\<Empty | { error: string }> {
//verify user is an athlete
const userRole = await this.userDirectory.getUserRole(athlete);
if (userRole !== Role.Athlete) {
return { error: `This user with user id: ${athlete} is not an athlete` };
}

```
//verify the team exists
const team = await this.teams.findOne({ name: title });

if (!team) {
  return { error: `Team with name "${title}" not found.` };
}

// verify the passkey for the team is correct
if (team.passKey !== passKey) {
  return { error: "Invalid passKey for this team." };
}

//verify the athlete is not already in another team
if (team.athletes.includes(athlete)) {
  return { error: `Athlete ${athlete} is already a member of "${title}"` };
}

//add athlete to team
await this.teams.updateOne(
  { _id: team._id },
  { $addToSet: { athletes: athlete } },
);

return {};
```

}

/\*\*

* Remove an athlete from a team
*
* @requires Team exists with this title.
* @requires Athlete (by ID) is currently a member of the team.
* @requires athlete exists and athlete.role = athlete.
*
* @effects Removes the athlete's ID from the team's 'athletes' set.
*
* @param title The name of the team from which the athlete will be removed.
* @param athlete The ID of the athlete to remove.
*
* @returns An empty object on success, or an error message.
  \*/
  async removeAthlete(
  title: string,
  athlete: UserId,
  ): Promise\<Empty | { error: string }> {
  //verify user is an athlete
  const userRole = await this.userDirectory.getUserRole(athlete);
  if (userRole !== Role.Athlete) {
  return { error: `This user with user id: ${athlete} is not an athlete` };
  }

```
//verify the team exists
```

```
const team = await this.teams.findOne({ name: title });

if (!team) {
  return { error: `Team with name "${title}" not found.` };
}

//verify the athlete is current part of the team and can be removed
if (!team.athletes.includes(athlete)) {
  return {
    error: `Athlete ${athlete} is not a member of team "${title}".`,
  };
}

//remove the athelte
await this.teams.updateOne(
  { _id: team._id },
  { $pull: { athletes: athlete } }, // $pull removes the specified value from the array
);

return {};
```

}

/\*\*

* Gets the team based on the coach
*
* @requires the coach exists
* @requires the coach has role = coach
* @effects returns the team the coach coaches
*
* @param coachId The ID of the coach.
* @returns An array of all teams by the given user.
  \*/
  async getTeamByCoach(coachId: UserId): Promise\<Team | { error: string }> {
  const userRole = await this.userDirectory.getUserRole(coachId);
  if (userRole !== Role.Coach) {
  return { error: `This user with user id: ${coachId} is not an athlete` };
  }

```
const team = await this.teams.findOne({ coach: coachId });
```

```
if (!team) {
  return { error: `Coach ${coachId} does not have a team` };
}
return team;
```

}

/\*\*

* Gets the team that the current athlete belongs to
*
* @requires the athlete exists
* @requires the athlete has role == athlete
* @effects returns the team the athlete is a part of
*
* @param athleteId a valid userId that belongs to the athlete you are querying for
* @returns the teamt the athlete belongs to
  \*/
  async getTeamByAthlete(athleteId: UserId): Promise\<Team | { error: string }> {
  // match when athleteId is an element in the athletes array
  //verify user is an athlete
  const userRole = await this.userDirectory.getUserRole(athleteId);
  if (userRole !== Role.Athlete) {
  return {
  error: `This user with user id: ${athleteId} is not an athlete`,
  };
  }

```
//get the team
```

```
const team = await this.teams.findOne({ athletes: { $in: [athleteId] } });
if (!team) {
  return { error: `Athlete ${athleteId} does not belong to a team` };
}
return team;
```

}

/\*\*

* Gets the athletes in a given team by team id
*
* @requires the team exists
* @effects returns the athletes on that team
*
* @param teamId - The id of the team.
* @returns A list of athlete IDs in the team, or an error.
  \*/
  async getAthletesByTeam(teamId: TeamID): Promise\<UserId\[] | { error: string }> {
  const team = await this.teams.findOne({ \_id: teamId });

```
if (!team) {
```

```
  return { error: `Team with id "${teamId}" not found.` };
}

return team.athletes;
```

}
}
