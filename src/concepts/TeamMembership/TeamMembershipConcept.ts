import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { User } from "../UserDirectory/UserDirectoryConcept.ts";

const PREFIX = "TeamMembership" + ".";

export type TeamID = ID;

export interface Team {
  _id: TeamID;
  name: string;
  passKey: string;
  coach: User;
  athletes: User[];
}

/**
 * @concept TeamMembership
 * @purpose Organize teams and their membership so coaches can create teams and athletes can join them.
 * @principle After a coach creates a team with a unique name and passKey,
 *            athletes who know the passKey can join the team and remain members until they leave.
 */
export default class TeamMembershipConcept {
  private teams: Collection<Team>;

  constructor(private readonly db: Db) {
    this.teams = this.db.collection(PREFIX + "teams");
  }

  /**
   * Makes a new team
   *
   * @requires  No team with this name exists
   * @requires the coach does not coach another team
   * @effects Generates a new team object with the provided title, coach, and passKey.
   *          The new team initially has an empty list of athletes.
   *
   * @param title  The desired name for the new team.
   * @param coach The user who will coach this team.
   * @param passKey The passKey required for athletes to join the team.
   *
   * @returns The ID of the new team on success
   */

  async createTeam(title: string, coach: User, passKey: string): Promise<{ newTeam: Team } | { error: string }> {
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
   * @requires passKey matches team's passKey.
   * @requires Athlete is not already a member of the team.
   * @effects Adds the athlete's to the team's 'athletes' set.
   *
   * @param title The name of the team to which the athlete will be added.
   * @param athlete The athlete to add.
   * @param passKey The passKey required to join the team.
   *
   * @returns An empty object on success, or an error message.
   */

  async addAthlete(title: string, athlete: User, passKey: string): Promise<Empty | { error: string }> {
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
   * @requires Athlete is currently a member of the team.
   * @effects Removes the athlete from the team's 'athletes' set.
   *
   * @param title The name of the team from which the athlete will be removed.
   * @param athlete The athlete to remove.
   *
   * @returns An empty object on success, or an error message.
   */
  async removeAthlete(title: string, athlete: User): Promise<Empty | { error: string }> {
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
   * @requires the coach has a team
   * @effects returns the team the coach coaches
   *
   * @param coachId The coach.
   * @returns An array of all teams by the given user.
   */
  async getTeamByCoach(coachId: User): Promise<Team | { error: string }> {
    const team = await this.teams.findOne({ coach: coachId });
    if (!team) {
      return { error: `Coach ${coachId} does not have a team` };
    }
    return team;
  }

  /**
   * Gets the team that the current athlete belongs to
   *
   * @requires the athlete is a part of a team
   * @effects returns the team the athlete is a part of
   *
   * @param athleteId a valid userId that belongs to the athlete you are querying for
   * @returns the teamt the athlete belongs to
   */
  async getTeamByAthlete(athleteId: User): Promise<Team | { error: string }> {
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
  async getAthletesByTeam(teamId: TeamID): Promise<User[] | { error: string }> {
    const team = await this.teams.findOne({ _id: teamId });

    if (!team) {
      return { error: `Team with id "${teamId}" not found.` };
    }

    return team.athletes;
  }
}