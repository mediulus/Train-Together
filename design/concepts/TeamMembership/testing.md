
[@testing-concepts](../../background/testing-concepts.md)
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
  _id: TeamID;
  name: string;
  passKey: string;
  coach: UserId;
  athletes: UserId[];
}

/**
 * @concept TeamMembership
 * @purpose Organize teams and their membership so coaches can create teams and athletes can join them.
 * @principle After a coach creates a team with a unique name and passKey,
 *            athletes who know the passKey can join the team and remain members until they leave.
 */
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

    // Ensure a coach can only coach one team at a time.
    this.teams.createIndex({ coach: 1 }, { unique: true }).catch((err) =>
      console.error(
        `Error creating unique index for TeamMembership.teams.coach: ${err}`,
      )
    );
  }

  /**
   * Makes a new team
   *
   * @requires  No team with this name exists
   * @requires coach exists and coach.role = coach
   * @requires the coach does not coach another team
   *
   * @effects Generates a new team object with the provided title, coach, and passKey.
   *          The new team initially has an empty list of athletes.
   *
   * @param title  The desired name for the new team.
   * @param coach The ID of the user who will coach this team.
   * @param passKey The passKey required for athletes to join the team.
   *
   * @returns The ID of the new team on success
   */

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
  }

  /**
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
   */

  async addAthlete(
    title: string,
    athlete: UserId,
    passKey: string,
  ): Promise<Empty | { error: string }> {
    //verify user is an athlete
    const userRole = await this.userDirectory.getUserRole(athlete);
    if (userRole !== Role.Athlete) {
      return { error: `This user with user id: ${athlete} is not an athlete` };
    }

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
  }

  /**
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
   */
  async removeAthlete(
    title: string,
    athlete: UserId,
  ): Promise<Empty | { error: string }> {
    //verify user is an athlete
    const userRole = await this.userDirectory.getUserRole(athlete);
    if (userRole !== Role.Athlete) {
      return { error: `This user with user id: ${athlete} is not an athlete` };
    }

    //verify the team exists
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
  }

  /**
   * Gets the team based on the coach
   *
   * @requires the coach exists
   * @requires the coach has role = coach
   * @effects returns the team the coach coaches
   *
   * @param coachId The ID of the coach.
   * @returns An array of all teams by the given user.
   */
  async getTeamByCoach(coachId: UserId): Promise<Team | { error: string }> {
    const userRole = await this.userDirectory.getUserRole(coachId);
    if (userRole !== Role.Coach) {
      return { error: `This user with user id: ${coachId} is not an athlete` };
    }

    const team = await this.teams.findOne({ coach: coachId });
    if (!team) {
      return { error: `Coach ${coachId} does not have a team` };
    }
    return team;
  }

  /**
   * Gets the team that the current athlete belongs to
   *
   * @requires the athlete exists
   * @requires the athlete has role == athlete
   * @effects returns the team the athlete is a part of
   *
   * @param athleteId a valid userId that belongs to the athlete you are querying for
   * @returns the teamt the athlete belongs to
   */
  async getTeamByAthlete(athleteId: UserId): Promise<Team | { error: string }> {
    // match when athleteId is an element in the athletes array
    //verify user is an athlete
    const userRole = await this.userDirectory.getUserRole(athleteId);
    if (userRole !== Role.Athlete) {
      return {
        error: `This user with user id: ${athleteId} is not an athlete`,
      };
    }

    //get the team
    const team = await this.teams.findOne({ athletes: { $in: [athleteId] } });
    if (!team) {
      return { error: `Athlete ${athleteId} does not belong to a team` };
    }
    return team;
  }

  /**
   * Gets the athletes in a given team by team id
   *
   * @requires the team exists
   * @effects returns the athletes on that team
   * 
   * @param teamId - The id of the team.
   * @returns A list of athlete IDs in the team, or an error.
   */
  async getAthletesByTeam(teamId: TeamID): Promise<UserId[] | { error: string }> {
    const team = await this.teams.findOne({ _id: teamId });

    if (!team) {
      return { error: `Team with id "${teamId}" not found.` };
    }

    return team.athletes;
  }
}

# response:

```typescript
import { assertEquals, assertNotEquals, assertArrayIncludes } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import { freshID } from "@utils/database.ts";
import TeamMembershipConcept from "./TeamMembershipConcept.ts";
import UserDirectoryConcept, { Role } from "../UserDirectory/UserDirectoryConcept.ts";
import { ID } from "@utils/types.ts";

// # file: src/TeamMembership/TeamMembershipConcept.test.ts

Deno.test("TeamMembershipConcept", async (t) => {
  const [db, client] = await testDb();
  const userDirectory = new UserDirectoryConcept(db);
  const teamMembership = new TeamMembershipConcept(db, userDirectory);

  // --- Setup for common users ---
  const coachId = freshID() as ID;
  const athlete1Id = freshID() as ID;
  const athlete2Id = freshID() as ID;
  const nonExistentId = freshID() as ID; // For testing non-existent users

  await userDirectory.registerUser(coachId, "coach_user", Role.Coach);
  await userDirectory.registerUser(athlete1Id, "athlete1_user", Role.Athlete);
  await userDirectory.registerUser(athlete2Id, "athlete2_user", Role.Athlete);

  // Test data
  const teamName1 = "Team A";
  const teamPassKey1 = "secretA";
  const teamName2 = "Team B";
  const teamPassKey2 = "secretB";

  await t.step("createTeam: requires", async (t) => {
    await t.step("should prevent creating a team with a non-coach user", async () => {
      const result = await teamMembership.createTeam(
        "Invalid Team",
        athlete1Id, // Athlete trying to create a team
        "pass",
      );
      assertEquals((result as { error: string }).error, `User with userId: ${athlete1Id} is not a coach and cannot make a team`);
    });

    await t.step("should prevent creating a team if the coach already coaches another team", async () => {
      // First, create a team successfully
      const createResult1 = await teamMembership.createTeam(teamName1, coachId, teamPassKey1);
      assertNotEquals((createResult1 as { error: string }).error, undefined);
      const team1Id = (createResult1 as { newTeam: { _id: ID } }).newTeam._id;

      // Now, try to create another team with the same coach
      const createResult2 = await teamMembership.createTeam(teamName2, coachId, teamPassKey2);
      assertEquals((createResult2 as { error: string }).error, `User with userId: ${coachId} already coaches team "${teamName1}"`);

      // Clean up the created team for subsequent tests if necessary
      // For this test, we leave it as it's part of the scenario
    });

    await t.step("should prevent creating a team with a name that already exists", async () => {
      // A team with teamName1 already exists from the previous step
      const result = await teamMembership.createTeam(teamName1, freshID() as ID, "another_pass");
      assertEquals((result as { error: string }).error, `Team with name "${teamName1}" already exists.`);
    });
  });

  await t.step("createTeam: effects", async (t) => {
    // A team with teamName1 by coachId is already created in the previous step
    await t.step("should create a new team with correct details and empty athletes list", async () => {
      const coachTeam = await teamMembership.getTeamByCoach(coachId);
      assertNotEquals(coachTeam, null);
      assertEquals((coachTeam as any).name, teamName1);
      assertEquals((coachTeam as any).coach, coachId);
      assertEquals((coachTeam as any).passKey, teamPassKey1);
      assertEquals((coachTeam as any).athletes.length, 0);
    });
  });

  await t.step("addAthlete: requires", async (t) => {
    await t.step("should prevent adding an athlete to a non-existent team", async () => {
      const result = await teamMembership.addAthlete("NonExistentTeam", athlete1Id, "pass");
      assertEquals((result as { error: string }).error, `Team with name "NonExistentTeam" not found.`);
    });

    await t.step("should prevent adding an athlete with an incorrect passKey", async () => {
      const result = await teamMembership.addAthlete(teamName1, athlete1Id, "wrongpass");
      assertEquals((result as { error: string }).error, "Invalid passKey for this team.");
    });

    await t.step("should prevent adding a non-athlete user", async () => {
      const result = await teamMembership.addAthlete(teamName1, coachId, teamPassKey1);
      assertEquals((result as { error: string }).error, `This user with user id: ${coachId} is not an athlete`);
    });

    await t.step("should prevent adding an athlete who is already a member", async () => {
      // First, add athlete1 successfully
      const addResult1 = await teamMembership.addAthlete(teamName1, athlete1Id, teamPassKey1);
      assertEquals(addResult1, {});

      // Try adding athlete1 again
      const addResult2 = await teamMembership.addAthlete(teamName1, athlete1Id, teamPassKey1);
      assertEquals((addResult2 as { error: string }).error, `Athlete ${athlete1Id} is already a member of "${teamName1}"`);
    });
  });

  await t.step("addAthlete: effects", async (t) => {
    // Athlete1 is already added to teamName1 from the previous step
    await t.step("should add the athlete's ID to the team's athletes list", async () => {
      const coachTeam = await teamMembership.getTeamByCoach(coachId);
      assertNotEquals(coachTeam, null);
      const teamId = (coachTeam as any)._id;

      const athletes = await teamMembership.getAthletesByTeam(teamId);
      assertArrayIncludes(athletes as ID[], [athlete1Id]);
      assertEquals((athletes as ID[]).length, 1);

      // Add another athlete
      const addResult2 = await teamMembership.addAthlete(teamName1, athlete2Id, teamPassKey1);
      assertEquals(addResult2, {});
      const athletesAfterAdd = await teamMembership.getAthletesByTeam(teamId);
      assertArrayIncludes(athletesAfterAdd as ID[], [athlete1Id, athlete2Id]);
      assertEquals((athletesAfterAdd as ID[]).length, 2);
    });
  });

  await t.step("removeAthlete: requires", async (t) => {
    await t.step("should prevent removing an athlete from a non-existent team", async () => {
      const result = await teamMembership.removeAthlete("NonExistentTeam", athlete1Id);
      assertEquals((result as { error: string }).error, `Team with name "NonExistentTeam" not found.`);
    });

    await t.step("should prevent removing a non-member athlete", async () => {
      const nonMemberAthleteId = freshID() as ID;
      await userDirectory.registerUser(nonMemberAthleteId, "non_member", Role.Athlete);
      const result = await teamMembership.removeAthlete(teamName1, nonMemberAthleteId);
      assertEquals((result as { error: string }).error, `Athlete ${nonMemberAthleteId} is not a member of team "${teamName1}".`);
    });

    await t.step("should prevent removing a non-athlete user", async () => {
      const result = await teamMembership.removeAthlete(teamName1, coachId);
      assertEquals((result as { error: string }).error, `This user with user id: ${coachId} is not an athlete`);
    });
  });

  await t.step("removeAthlete: effects", async (t) => {
    await t.step("should remove the athlete's ID from the team's athletes list", async () => {
      const coachTeam = await teamMembership.getTeamByCoach(coachId);
      const teamId = (coachTeam as any)._id;

      // Athlete1 and Athlete2 are currently members
      let athletes = await teamMembership.getAthletesByTeam(teamId);
      assertArrayIncludes(athletes as ID[], [athlete1Id, athlete2Id]);
      assertEquals((athletes as ID[]).length, 2);

      // Remove athlete1
      const removeResult1 = await teamMembership.removeAthlete(teamName1, athlete1Id);
      assertEquals(removeResult1, {});

      athletes = await teamMembership.getAthletesByTeam(teamId);
      assertEquals((athletes as ID[]).includes(athlete1Id), false);
      assertArrayIncludes(athletes as ID[], [athlete2Id]);
      assertEquals((athletes as ID[]).length, 1);

      // Remove athlete2
      const removeResult2 = await teamMembership.removeAthlete(teamName1, athlete2Id);
      assertEquals(removeResult2, {});

      athletes = await teamMembership.getAthletesByTeam(teamId);
      assertEquals((athletes as ID[]).length, 0);
    });
  });

  await t.step("getTeamByCoach: requires", async (t) => {
    await t.step("should return an error if the user is not a coach", async () => {
      const result = await teamMembership.getTeamByCoach(athlete1Id);
      assertEquals((result as { error: string }).error, `This user with user id: ${athlete1Id} is not an athlete`);
    });

    await t.step("should return an error if the coach does not have a team", async () => {
      const anotherCoachId = freshID() as ID;
      await userDirectory.registerUser(anotherCoachId, "another_coach", Role.Coach);
      const result = await teamMembership.getTeamByCoach(anotherCoachId);
      assertEquals((result as { error: string }).error, `Coach ${anotherCoachId} does not have a team`);
    });
  });

  await t.step("getTeamByCoach: effects", async (t) => {
    await t.step("should return the correct team object for a coach", async () => {
      // teamName1 with coachId is already created
      const team = await teamMembership.getTeamByCoach(coachId);
      assertNotEquals(team, null);
      assertEquals((team as any).name, teamName1);
      assertEquals((team as any).coach, coachId);
    });
  });

  await t.step("getTeamByAthlete: requires", async (t) => {
    await t.step("should return an error if the user is not an athlete", async () => {
      const result = await teamMembership.getTeamByAthlete(coachId);
      assertEquals((result as { error: string }).error, `This user with user id: ${coachId} is not an athlete`);
    });

    await t.step("should return an error if the athlete does not belong to a team", async () => {
      const loneAthleteId = freshID() as ID;
      await userDirectory.registerUser(loneAthleteId, "lone_athlete", Role.Athlete);
      const result = await teamMembership.getTeamByAthlete(loneAthleteId);
      assertEquals((result as { error: string }).error, `Athlete ${loneAthleteId} does not belong to a team`);
    });
  });

  await t.step("getTeamByAthlete: effects", async (t) => {
    await t.step("should return the correct team object for an athlete", async () => {
      // Re-add athlete1 to teamName1 for this test
      await teamMembership.addAthlete(teamName1, athlete1Id, teamPassKey1);
      const team = await teamMembership.getTeamByAthlete(athlete1Id);
      assertNotEquals(team, null);
      assertEquals((team as any).name, teamName1);
      assertArrayIncludes((team as any).athletes, [athlete1Id]);

      // Clean up
      await teamMembership.removeAthlete(teamName1, athlete1Id);
    });
  });

  await t.step("getAthletesByTeam: requires", async (t) => {
    await t.step("should return an error if the team does not exist", async () => {
      const result = await teamMembership.getAthletesByTeam(freshID() as ID);
      assertEquals((result as { error: string }).error, `Team with id "${(result as { error: string }).error.split('"')[1]}" not found.`);
    });
  });

  await t.step("getAthletesByTeam: effects", async (t) => {
    await t.step("should return an empty array if the team exists but has no athletes", async () => {
      const newTeamName = "Empty Team";
      const newTeamPassKey = "emptyPass";
      const newCoachId = freshID() as ID;
      await userDirectory.registerUser(newCoachId, "new_coach", Role.Coach);
      const { newTeam } = await teamMembership.createTeam(newTeamName, newCoachId, newTeamPassKey) as any;

      const athletes = await teamMembership.getAthletesByTeam(newTeam._id);
      assertEquals(athletes, []);
    });

    await t.step("should return a list of athlete IDs in the team", async () => {
      // Athlete1 and Athlete2 are added to teamName1 in previous tests and then removed.
      // Re-add them for this specific check.
      await teamMembership.addAthlete(teamName1, athlete1Id, teamPassKey1);
      await teamMembership.addAthlete(teamName1, athlete2Id, teamPassKey1);

      const team = await teamMembership.getTeamByCoach(coachId);
      const teamId = (team as any)._id;

      const athletes = await teamMembership.getAthletesByTeam(teamId);
      assertArrayIncludes(athletes as ID[], [athlete1Id, athlete2Id]);
      assertEquals((athletes as ID[]).length, 2);

      // Clean up
      await teamMembership.removeAthlete(teamName1, athlete1Id);
      await teamMembership.removeAthlete(teamName1, athlete2Id);
    });
  });

  // # trace:
  // Describes a full trace of actions, such as how the principle is fulfilled.
  // Principle: After a coach creates a team with a unique name and passKey,
  //            athletes who know the passKey can join the team and remain members until they leave.
  await t.step("Principle Trace: Coach creates, athletes join, athletes leave", async () => {
    // 1. Setup: A new coach and a few athletes
    const traceCoachId = freshID() as ID;
    const traceAthlete1Id = freshID() as ID;
    const traceAthlete2Id = freshID() as ID;
    const traceTeamName = "Principle Team";
    const tracePassKey = "principlePass";

    await userDirectory.registerUser(traceCoachId, "trace_coach", Role.Coach);
    await userDirectory.registerUser(traceAthlete1Id, "trace_athlete1", Role.Athlete);
    await userDirectory.registerUser(traceAthlete2Id, "trace_athlete2", Role.Athlete);

    // 2. Coach creates a team
    const createResult = await teamMembership.createTeam(traceTeamName, traceCoachId, tracePassKey);
    assertNotEquals((createResult as { error: string }).error, `Error creating team: ${createResult}`);
    const teamId = (createResult as any).newTeam._id;
    const createdTeam = await teamMembership.getTeamByCoach(traceCoachId);
    assertEquals((createdTeam as any).name, traceTeamName);
    assertEquals((createdTeam as any).coach, traceCoachId);
    assertEquals((createdTeam as any).athletes.length, 0);

    // 3. Athletes who know the passKey join the team
    const joinResult1 = await teamMembership.addAthlete(traceTeamName, traceAthlete1Id, tracePassKey);
    assertEquals(joinResult1, {});

    const joinResult2 = await teamMembership.addAthlete(traceTeamName, traceAthlete2Id, tracePassKey);
    assertEquals(joinResult2, {});

    // 4. Verify athletes are members
    const teamAthletesAfterJoin = await teamMembership.getAthletesByTeam(teamId);
    assertArrayIncludes(teamAthletesAfterJoin as ID[], [traceAthlete1Id, traceAthlete2Id]);
    assertEquals((teamAthletesAfterJoin as ID[]).length, 2);

    const athlete1Team = await teamMembership.getTeamByAthlete(traceAthlete1Id);
    assertEquals((athlete1Team as any)._id, teamId);
    const athlete2Team = await teamMembership.getTeamByAthlete(traceAthlete2Id);
    assertEquals((athlete2Team as any)._id, teamId);

    // 5. Athletes leave the team
    const leaveResult1 = await teamMembership.removeAthlete(traceTeamName, traceAthlete1Id);
    assertEquals(leaveResult1, {});

    // 6. Verify athletes are no longer members
    const teamAthletesAfterLeave1 = await teamMembership.getAthletesByTeam(teamId);
    assertEquals((teamAthletesAfterLeave1 as ID[]).includes(traceAthlete1Id), false);
    assertArrayIncludes(teamAthletesAfterLeave1 as ID[], [traceAthlete2Id]);
    assertEquals((teamAthletesAfterLeave1 as ID[]).length, 1);

    const athlete1TeamAfterLeave = await teamMembership.getTeamByAthlete(traceAthlete1Id);
    assertEquals((athlete1TeamAfterLeave as { error: string }).error, `Athlete ${traceAthlete1Id} does not belong to a team`);

    const leaveResult2 = await teamMembership.removeAthlete(traceTeamName, traceAthlete2Id);
    assertEquals(leaveResult2, {});

    const teamAthletesAfterLeave2 = await teamMembership.getAthletesByTeam(teamId);
    assertEquals((teamAthletesAfterLeave2 as ID[]).length, 0);

    const athlete2TeamAfterLeave = await teamMembership.getTeamByAthlete(traceAthlete2Id);
    assertEquals((athlete2TeamAfterLeave as { error: string }).error, `Athlete ${traceAthlete2Id} does not belong to a team`);
  });

  await client.close();
});
```