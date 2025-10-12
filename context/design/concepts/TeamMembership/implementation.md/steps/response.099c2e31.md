---
timestamp: 'Sat Oct 11 2025 18:03:45 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_180345.bf33cfe8.md]]'
content_id: 099c2e3165b1dcc34739a6c7a38d857ce787acd8bd5b3dae51f4604c25acd397
---

# response:

Okay, this is a well-defined `TeamMembership` concept! I'll provide the TypeScript implementation following all the guidelines you've outlined, including state mapping, action implementation, error handling, and documentation.

### Key Considerations and Changes:

1. **`removeAthlete` argument:** The original spec for `removeAthlete` used `athleteName: String`. For consistency and to uphold concept independence (meaning `TeamMembership` shouldn't need to know how to resolve a human-readable name to a `User` ID from another concept), I've changed this to `athlete: User` (assuming `User` is an `ID` type), mirroring `addAthlete`.
2. **User Role Invariants:** The `requires` clauses (`coach.role = coach`, `athlete.role = athlete`) are critical. As per concept design principles, `TeamMembership` should **not** directly access properties like `role` from a `User` object (as `User` is an external ID). Instead, these checks would be performed by a separate `User` or `UserProfile` concept, and then a **synchronization (sync)** would call `TeamMembership`'s actions *only if* the roles are correct. The implementation assumes these checks are handled externally.
3. **`passKey` type:** I've explicitly defined `passKey` as `string` in the `TeamDocument` interface.
4. **Error Handling:** Actions return `Promise<... | { error: string }>` for expected validation failures.
5. **MongoDB Index:** Added a unique index on `team.name` to enforce the "no team with this name exists" precondition efficiently.
6. **Queries:** Included a couple of query methods (prefixed with `_`) for retrieving data, which are useful for testing and external consumption.

***

### `src/TeamMembership/TeamMembershipConcept.ts`

```typescript
// src/TeamMembership/TeamMembershipConcept.ts

import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts"; // Assumed utility for generating unique IDs

// Declare collection prefix, using the concept name for isolation
const PREFIX = "TeamMembership" + ".";

/**
 * Type representing a User ID. This concept treats User as an opaque identifier.
 * Details about users (like their roles or names) are managed by other concepts.
 */
type User = ID;

/**
 * Type representing a Team ID. These IDs are generated and managed by this concept.
 */
type Team = ID;

/**
 * Defines the structure for a 'Team' document stored in the MongoDB collection.
 *
 * This corresponds to the 'state' section of the concept specification:
 * a set of Teams with:
 *   a name String
 *   a passKey String
 *   a coach User         // ID of the user who coaches this team
 *   athletes {Users}     // Set of User IDs who are members of this team
 */
interface TeamDocument {
  _id: Team;
  name: string;
  passKey: string;
  coach: User; // The ID of the user who coaches this team
  athletes: User[]; // A list of User IDs who are members of this team
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
  private teams: Collection<TeamDocument>;

  constructor(private readonly db: Db) {
    this.teams = this.db.collection<TeamDocument>(PREFIX + "teams");
    // Ensure that team names are unique, as required by createTeam's precondition.
    this.teams.createIndex({ name: 1 }, { unique: true }).catch(console.error);
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
    { title, coach, passKey }: { title: string; coach: User; passKey: string },
  ): Promise<{ newTeam: Team } | { error: string }> {
    // Check precondition: no team with this name exists
    const existingTeam = await this.teams.findOne({ name: title });
    if (existingTeam) {
      return { error: `Team with name "${title}" already exists.` };
    }

    // Note: The checks for 'coach exists' and 'coach.role = coach' are external concerns
    // that should be handled by a synchronization (sync) or the calling logic.
    // This concept assumes 'coach' is a valid User ID from an external source.

    const newTeamId = freshID() as Team; // Generate a fresh ID for the new team
    const newTeam: TeamDocument = {
      _id: newTeamId,
      name: title,
      coach: coach,
      passKey: passKey,
      athletes: [], // New teams start with no athletes
    };

    await this.teams.insertOne(newTeam);
    return { newTeam: newTeamId };
  }

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
    { title, athlete, passKey }: {
      title: string;
      athlete: User;
      passKey: string;
    },
  ): Promise<Empty | { error: string }> {
    const team = await this.teams.findOne({ name: title });

    // Check precondition: Team exists
    if (!team) {
      return { error: `Team with name "${title}" not found.` };
    }

    // Check precondition: passKey matches
    if (team.passKey !== passKey) {
      return { error: "Invalid passKey for this team." };
    }

    // Check precondition: athlete not already in team
    if (team.athletes.includes(athlete)) {
      return { error: `Athlete ${athlete} is already a member of "${title}".` };
    }

    // Note: The checks for 'athlete exists' and 'athlete.role = athlete' are external concerns.
    // This concept assumes 'athlete' is a valid User ID.

    await this.teams.updateOne(
      { _id: team._id },
      { $addToSet: { athletes: athlete } }, // $addToSet prevents duplicates
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
  async removeAthlete(
    { title, athlete }: { title: string; athlete: User },
  ): Promise<Empty | { error: string }> {
    const team = await this.teams.findOne({ name: title });

    // Check precondition: Team exists
    if (!team) {
      return { error: `Team with name "${title}" not found.` };
    }

    // Check precondition: Athlete is a member of the team
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

  // --- Concept Queries (for observing state) ---

  /**
   * Query: _getTeamsByCoach
   *
   * @param {User} coachId - The ID of the coach.
   * @returns {Promise<TeamDocument[]>} - An array of all teams coached by the given user.
   */
  async _getTeamsByCoach(
    { coachId }: { coachId: User },
  ): Promise<TeamDocument[]> {
    return await this.teams.find({ coach: coachId }).toArray();
  }

  /**
   * Query: _getAthletesInTeam
   *
   * @param {string} title - The name of the team.
   * @returns {Promise<User[] | { error: string }>} - A list of athlete IDs in the team, or an error.
   */
  async _getAthletesInTeam(
    { title }: { title: string },
  ): Promise<User[] | { error: string }> {
    const team = await this.teams.findOne({ name: title });
    if (!team) {
      return { error: `Team with name "${title}" not found.` };
    }
    return team.athletes;
  }

  /**
   * Query: _getTeamByName
   *
   * @param {string} title - The name of the team.
   * @returns {Promise<TeamDocument | null>} - The team document, or null if not found.
   */
  async _getTeamByName(
    { title }: { title: string },
  ): Promise<TeamDocument | null> {
    return await this.teams.findOne({ name: title });
  }
}
```
