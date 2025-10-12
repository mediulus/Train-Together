import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

const PREFIX = "TeamMembership" + ".";

type User = ID;
type TeamID = ID;

interface Team {
  _id: TeamID;
  name: string;
  passKey: string;
  coach: User;
  athletes: User[];
}


/**
 * Concept: TeamMembership
 *
 * Purpose: Organize teams and their membership so coaches can create teams and athletes can join them.
 *
 * Principle: After a coach creates a team with a unique name and passKey,
 *            athletes who know the passKey can join the team and remain members until they leave.
 */
export default class TeamMembershipConcept {
  private teams: Collection<Team>;
  
  constructor(private readonly db: Db) {
    this.teams = this.db.collection(PREFIX + "teams");

    this.teams.createIndex({ name: 1 }, { unique: true }).catch((err) =>
      console.error(
        `Error creating unique index for TeamMembership.teams.name: ${err}`,
      )
    );
  }

  /**
   * Action: createTeam
   *
   * @param {string} title - The desired name for the new team.
   * @param {User} coach - The ID of the user who will coach this team.
   * @param {string} passKey - The passKey required for athletes to join the team.
   * @returns {Promise<{ newTeam: Team } | { error: string }>} - The ID of the new team on success,
   *                                                             or an error message if the team name exists or validation fails.
   *
   * requires:
   *   - No team with this name exists. (Enforced by unique index and explicit check)
   *   - coach exists and coach.role = coach. (Expected to be handled by an external sync/caller.)
   *
   * effects:
   *   - Generates a new team object with the provided title, coach, and passKey.
   *   - The new team initially has an empty list of athletes.
   */

  async createTeam(
    {title, coach, passKey}:
     {title: string;
      coach: User;
      passKey: string;}): Promise<{ newTeam: Team } | { error: string }> {
        const existingTeam = await this.teams.findOne({ name: title });
        if (existingTeam) {
          return { error: `Team with name "${title}" already exists.` };
        }

        const newTeamID = freshID() as TeamID;

        const newTeam: Team = {
          _id: newTeamID,
          name: title,
          coach: coach,
          passKey: passKey,
          athletes: [], // New teams start with no athletes
        };

        await this.teams.insertOne(newTeam);
        return {newTeam: newTeam}
    };

    /**
     * Action: addAthlete
     *
     * @param {string} title - The name of the team to which the athlete will be added.
     * @param {User} athlete - The ID of the athlete to add.
     * @param {string} passKey - The passKey required to join the team.
     * @returns {Promise<Empty | { error: string }>} - An empty object on success, or an error message.
     *
     * requires:
     *   - Team exists with this title.
     *   - Provided passKey matches team's passKey.
     *   - athlete exists and athlete.role = athlete. (Expected to be handled by an external sync/caller.)
     *   - Athlete is not already a member of the team.
     *
     * effects:
     *   - Adds the athlete's ID to the team's 'athletes' set.
     *   - Ensures the athlete ID is unique within the set (MongoDB's $addToSet handles this).
     */

    async addAthlete(
      {title, athlete, passKey}: {
        title: string;
        athlete: User;
        passKey: string;
      },
    ): Promise<Empty | { error: string }> {
      const team = await this.teams.findOne({name: title});

      if (!team) {
        return {error: `Team with name "${title}" not found.`};
      }

      if (team.passKey !== passKey) {
        return {error: "Invalid passKey for this team."}
      }

      if (team.athletes.includes(athlete)) {
        return {error: `Athlete ${athlete} is already a member of "${title}"`}
      }

      await this.teams.updateOne(
        {_id: team._id},
        {$addToSet: {athletes: athlete}}
      );

      return {};
    }

      /**
   * Action: removeAthlete
   *
   * @param {string} title - The name of the team from which the athlete will be removed.
   * @param {User} athlete - The ID of the athlete to remove.
   * @returns {Promise<Empty | { error: string }>} - An empty object on success, or an error message.
   *
   * requires:
   *   - Team exists with this title.
   *   - Athlete (by ID) is currently a member of the team.
   *   - athlete exists and athlete.role = athlete. (Expected to be handled by an external sync/caller.)
   *
   * effects:
   *   - Removes the athlete's ID from the team's 'athletes' set.
   */
  async removeAthlete({title, athlete}: {title: string; athlete:User}): Promise<Empty | { error: string }> {
    const team = await this.teams.findOne({ name: title });
      
    if (!team) {
      return { error: `Team with name "${title}" not found.` };
    }

    if (!team.athletes.includes(athlete)) {
      return {
        error: `Athlete ${athlete} is not a member of team "${title}".`,
      };
    }

    await this.teams.updateOne(
      { _id: team._id },
      { $pull: { athletes: athlete } }, // $pull removes the specified value from the array
    );

    return {};
  }

  /**
   * Query: getTeamByCoach
   *
   * @param {User} coachId - The ID of the coach.
   * @returns {Promise<TeamDocument[]>} - An array of all teams coached by the given user.
   */
  async getTeamByCoach(
    {coachId}: {coachId: User}
  ): Promise<Team | {error: string}> {
     const team = await this.teams.findOne({coach: coachId});
     if (!team) {
      return {error: `Coach ${coachId} does not have a team`};
     }

     return team;
  };

  async getTeamByAthlete(
    {athleteId}: {athleteId: User}
  ): Promise<Team | {error: string}> {
  // match when athleteId is an element in the athletes array
  const team = await this.teams.findOne({ athletes: { $in: [athleteId] } });
  if (!team) {
   return {error: `Athlete ${athleteId} does not belong to a team`};
  }
    return team;
  };



  /**
   * Query: getAthletesInTeam
   *
   * @param {string} title - The name of the team.
   * @returns {Promise<User[] | { error: string }>} - A list of athlete IDs in the team, or an error.
   */
  async getAthletesByTeam(
    {title}: {title: string}
  ): Promise<User[] | {error: string}> {
    const team = await this.teams.findOne({title: title});

    if (!team) {
      return {error: `Team with name "${title}" not found.`}
    }

    return team.athletes
  };

  
}

