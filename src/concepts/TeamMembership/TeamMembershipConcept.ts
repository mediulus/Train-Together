import { Collection, Db } from "mongodb";
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

  async createTeam(params: {
    title?: string;
    coach?: User;
    coachId?: ID;
    passKey?: string;
  }): Promise<{ newTeam: Team } | { error: string }> {
    const title = params.title?.trim();
    const passKey = params.passKey?.trim();
    const coachParam = params.coach ?? params.coachId;
    const coachId =
      typeof coachParam === "string" ? coachParam : coachParam?._id;
    const coach: User | undefined =
      typeof coachParam === "object" && coachParam !== null
        ? (coachParam as User)
        : coachId
        ? ({ _id: coachId } as unknown as User)
        : undefined;

    if (!title) return { error: "Missing title." };
    if (!passKey) return { error: "Missing passKey." };
    if (!coachId) return { error: "Missing coachId." };
    if (!coach) return { error: "Invalid coach reference." };

    // verify the coach does not already coach another team
    const existingCoachTeam = await this.teams.findOne({
      "coach._id": coachId,
    });
    if (existingCoachTeam) {
      return {
        error: `User with userId: ${coachId} already coaches team "${existingCoachTeam.name}"`,
      };
    }

    // verify team does not exist
    const existingTeam = await this.teams.findOne({ name: title });
    if (existingTeam) {
      return { error: `Team with name "${title}" already exists.` };
    }

    // generate the new team
    const newTeamID = freshID() as TeamID;
    const newTeam: Team = {
      _id: newTeamID,
      name: title,
      coach,
      passKey,
      athletes: [],
    };

    await this.teams.insertOne(newTeam);
    return { newTeam };
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

  async addAthlete(
    params:
      | { title: string; athlete?: User; athleteId?: ID; passKey: string }
      | string,
    maybeAthleteOrId?: User | ID,
    maybePassKey?: string
  ): Promise<Empty | { error: string }> {
    const title = typeof params === "string" ? params : params.title;
    const passKey =
      typeof params === "string" ? (maybePassKey as string) : params.passKey;
    const athleteParam =
      typeof params === "string"
        ? maybeAthleteOrId
        : params.athlete ?? params.athleteId;
    const athleteId =
      typeof athleteParam === "string" ? athleteParam : athleteParam?._id;
    const fullAthlete =
      typeof athleteParam === "object" && athleteParam !== null
        ? (athleteParam as User)
        : athleteId
        ? ({ _id: athleteId } as unknown as User)
        : undefined;

    if (!title) return { error: "Missing title." };
    if (!athleteId) return { error: "Missing athleteId." };
    if (!passKey) return { error: "Missing passKey." };

    //verify the team exists
    const team = await this.teams.findOne({ name: title });

    if (!team) {
      return { error: `Team with name "${title}" not found.` };
    }

    // verify the passkey for the team is correct
    if (team.passKey !== passKey) {
      return { error: "Invalid passKey for this team." };
    }

    // verify the athlete is not already on this team (compare by _id)
    if (team.athletes.some((a) => String(a._id) === String(athleteId))) {
      return {
        error: `Athlete ${athleteId} is already a member of "${title}"`,
      };
    }

    //add athlete to team
    await this.teams.updateOne(
      { _id: team._id },
      { $addToSet: { athletes: fullAthlete! } }
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
  async removeAthlete(
    params: { title: string; athlete?: User; athleteId?: ID } | string,
    maybeAthlete?: User | ID
  ): Promise<Empty | { error: string }> {
    const title = typeof params === "string" ? params : params.title;
    const athleteParam =
      typeof params === "string"
        ? maybeAthlete
        : params.athlete ?? params.athleteId;
    const athleteId =
      typeof athleteParam === "string" ? athleteParam : athleteParam?._id;

    if (!title) return { error: "Missing title." };
    if (!athleteId) return { error: "Missing athleteId." };

    //verify the team exists
    const team = await this.teams.findOne({ name: title });

    if (!team) {
      return { error: `Team with name "${title}" not found.` };
    }

    // verify the athlete is currently part of the team (compare by _id)
    console.log("team.athletes:", team.athletes);
    if (!team.athletes.some((a) => String(a._id) === String(athleteId))) {
      return {
        error: `Athlete ${athleteId} is not a member of team "${title}".`,
      };
    }

    //remove the athelte
    await this.teams.updateOne(
      { _id: team._id },
      { $pull: { athletes: { _id: athleteId } } } // remove by matching nested _id
    );

    return {};
  }

  /**
   * Gets the team based on the coach
   *
   * @requires the coach has a team
   * @effects returns the team the coach coaches
   *
   *
   * @param coachId The coach.
   * @returns An array of all teams by the given user.
   */
  async getTeamByCoach(
    input: { coachId?: User | ID } | User | ID
  ): Promise<Team | { error: string }> {
    console.log;
    const coachParam =
      typeof input === "object" && input !== null && "coachId" in input
        ? (input as { coachId?: User | ID }).coachId
        : input;
    const id =
      typeof coachParam === "string"
        ? coachParam
        : (coachParam as User | undefined)?._id;
    if (!id) return { error: "Missing coachId." };
    const team = await this.teams.findOne({ "coach._id": id });
    if (!team) {
      return { error: `Coach ${id} does not have a team` };
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
  async getTeamByAthlete(
    input: { athleteId?: User | ID } | User | ID
  ): Promise<Team | { error: string }> {
    const athleteParam =
      typeof input === "object" && input !== null && "athleteId" in input
        ? (input as { athleteId?: User | ID }).athleteId
        : input;
    const id =
      typeof athleteParam === "string"
        ? athleteParam
        : (athleteParam as User | undefined)?._id;
    if (!id) return { error: "Missing athleteId." };
    const team = await this.teams.findOne({ "athletes._id": id });
    if (!team) {
      return { error: `Athlete ${id} does not belong to a team` };
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

  /**
   * Disbands a team (coach only)
   *
   * @requires team with name exists
   * @requires requesting coach owns the team
   * @effects deletes the team document
   *
   * @param params { title, coachId | coach }
   * @returns {} | { error }
   */
  async deleteTeam(
    params: { title?: string; coachId?: ID; coach?: User } | string,
    maybeCoach?: User | ID
  ): Promise<Empty | { error: string }> {
    const title = typeof params === "string" ? params : params.title;
    const coachParam =
      typeof params === "string" ? maybeCoach : params.coach ?? params.coachId;
    const coachId =
      typeof coachParam === "string" ? coachParam : coachParam?._id;
    if (!title) return { error: "Missing title." };
    if (!coachId) return { error: "Missing coachId." };
    const team = await this.teams.findOne({ name: title });
    if (!team) return { error: `Team with name "${title}" not found.` };
    if (String(team.coach._id) !== String(coachId)) {
      return { error: "Only the coach of this team can disband it." };
    }
    await this.teams.deleteOne({ _id: team._id });
    return {};
  }
}
