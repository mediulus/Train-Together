[@testing-concepts](../../background/testing-concepts.md)

# test: TeamMebership - implement these test cases following the operational principle: where a coach creates a team, then an athlete joins a team. Then try to leave the team.

## Concept
      concept TeamMembership:
          purpose: Organize teams and their membership so coaches can create teams and athletes can join them.
          principle: After a coach creates a team with a unique name and passKey, athletes who know the passKey can join the team and remain members until they leave.

          state:
              a set of Teams with:
                  an id: ID
                  a name String
                  a passKey
                  a coach User // User.role = coach -> invariant held in the actions
                  athletes {Users} // User.role = athlete -> invariant held in the actions

          actions:
                createTeam(title: String, coach: User, passKey: String): (newTeam: Team)
                    requires: 
                        - no team with this name exists
                        - this coach does not coach another team
                    effects: generates a new team object with name = title, coach = coach, passKey = passKey

                addAthlete(title: String, athlete: User, passkey: String)
                    requires: 
                        - Team exists with this title
                        - passKey = team.passKey
                        - athlete is not already a member of this team
                    effects: adds the athlete to the team.athletes set

                removeAthlete(title: String, athlete: User)
                    requires: 
                        - Team exists with this title
                        - user is in team.athletes
                    effects: removes the athlete with that name from the team.athletes set

                getTeamByCoach(coachId: ID): coachesTeam: Team
                    requires: the coach has a team
                    effects: returns the team the coach owns 

                getTeamByAthlete(athleteId: ID): athletesTeam: Team
                    requires: the athlete has a team
                    effects: returns the team the athlete is a part of 

                getAthletesByTeam(teamId): Athlete[]
                    requires: the team exists
                    effects: returns a list of the athletes in that team

import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { User } from "../UserDirectory/UserDirectoryConcept.ts";

const PREFIX = "TeamMembership" + ".";

type TeamID = ID;

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
# response:

The following Deno test file implements the test cases for the `TeamMembership` concept, focusing on verifying the `requires` and `effects` of each action and demonstrating the operational `principle`.

**File:** `src/TeamMembership/TeamMembershipConcept.test.ts`

```typescript
// file: src/TeamMembership/TeamMembershipConcept.test.ts
import { assertEquals, assertObjectMatch } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import TeamMembershipConcept, { Team, TeamID } from "./TeamMembershipConcept.ts";
import { User, UserID } from "../UserDirectory/UserDirectoryConcept.ts"; // Assuming this path for User interface

// Helper function to create dummy User objects for testing
function createDummyUser(
  id: UserID,
  role: "coach" | "athlete",
  username: string,
): User {
  return {
    _id: id,
    username: username,
    email: `${username}@example.com`,
    passwordHash: "hashedpassword",
    role: role,
  };
}

Deno.test("TeamMembership Concept", async (t) => {
  // Setup: Initialize database and concept instance
  const [db, client] = await testDb();
  const concept = new TeamMembershipConcept(db);

  // Define dummy User objects for coaches and athletes
  const coach1: User = createDummyUser("user1" as UserID, "coach", "coach1");
  const coach2: User = createDummyUser("user2" as UserID, "coach", "coach2");
  const athlete1: User = createDummyUser("user3" as UserID, "athlete", "athlete1");
  const athlete2: User = createDummyUser("user4" as UserID, "athlete", "athlete2");
  const athlete3: User = createDummyUser("user5" as UserID, "athlete", "athlete3"); // For testing athletes not in a team
  const nonTeamCoach: User = createDummyUser("user10" as UserID, "coach", "nonTeamCoach"); // A coach without a team

  // Define team names and passkeys for various tests
  const team1Name = "Dragons";
  const team1PassKey = "dragonpass";
  const team2Name = "Eagles";
  const team2PassKey = "eaglepass";

  let team1: Team; // Variable to store the first created team for subsequent tests

  Deno.test("1. createTeam action", async (t) => {
    await t.step("1.1. effects: should successfully create a team with a unique name and coach", async () => {
      const result = await concept.createTeam(team1Name, coach1, team1PassKey);
      assertEquals("newTeam" in result, true, "Should return a newTeam object on success");
      team1 = (result as { newTeam: Team }).newTeam; // Store the team for later tests

      // Verify the returned team object has correct properties
      assertObjectMatch(team1, {
        name: team1Name,
        coach: coach1,
        passKey: team1PassKey,
        athletes: [], // New team should start with no athletes
      });

      // Verify the team is persisted in the database
      const fetchedTeam = await db.collection("TeamMembership.teams").findOne({ _id: team1._id });
      assertObjectMatch(fetchedTeam!, {
        name: team1Name,
        coach: coach1,
        passKey: team1PassKey,
        athletes: [],
      });
    });

    await t.step("1.2. requires: should fail if a team with the same name already exists", async () => {
      const result = await concept.createTeam(team1Name, coach2, "anotherpass");
      assertEquals("error" in result, true, "Should return an error for duplicate team name");
      assertEquals((result as { error: string }).error, `Team with name "${team1Name}" already exists.`);
    });

    await t.step("1.3. requires: should fail if the coach already coaches another team", async () => {
      const result = await concept.createTeam(team2Name, coach1, team2PassKey);
      assertEquals("error" in result, true, "Should return an error if coach already has a team");
      // Note: The concept's error message stringifies the entire User object
      assertEquals((result as { error: string }).error, `User with userId: [object Object] already coaches team "${team1Name}"`);
    });

    await t.step("1.4. effects: should successfully create a second team with a different coach and name", async () => {
      const result = await concept.createTeam(team2Name, coach2, team2PassKey);
      assertEquals("newTeam" in result, true, "Should successfully create a second team");
      const team2 = (result as { newTeam: Team }).newTeam;
      assertObjectMatch(team2, {
        name: team2Name,
        coach: coach2,
        passKey: team2PassKey,
        athletes: [],
      });
    });
  });

  Deno.test("2. addAthlete action", async (t) => {
    await t.step("2.1. effects: should successfully add an athlete to a team", async () => {
      const result = await concept.addAthlete(team1Name, athlete1, team1PassKey);
      assertEquals("error" in result, false, `Should not return an error: ${result.error}`);
      assertEquals(Object.keys(result).length, 0, "Should return an empty object on success");

      // Verify effect: athlete is now in the team's athletes set
      const updatedTeam = await db.collection("TeamMembership.teams").findOne({ _id: team1._id });
      assertEquals(updatedTeam!.athletes.length, 1);
      assertObjectMatch(updatedTeam!.athletes[0], athlete1); // Verify the added athlete
    });

    await t.step("2.2. requires: should fail if the team does not exist", async () => {
      const result = await concept.addAthlete("NonExistentTeam", athlete2, "pass");
      assertEquals("error" in result, true, "Should return an error for non-existent team");
      assertEquals((result as { error: string }).error, 'Team with name "NonExistentTeam" not found.');
    });

    await t.step("2.3. requires: should fail if the passKey is incorrect", async () => {
      const result = await concept.addAthlete(team1Name, athlete2, "wrongpass");
      assertEquals("error" in result, true, "Should return an error for invalid passKey");
      assertEquals((result as { error: string }).error, "Invalid passKey for this team.");
    });

    await t.step("2.4. requires: should fail if the athlete is already a member of the team", async () => {
      const result = await concept.addAthlete(team1Name, athlete1, team1PassKey);
      assertEquals("error" in result, true, "Should return an error if athlete is already a member");
      // Note: The concept's error message stringifies the entire User object
      assertEquals((result as { error: string }).error, `Athlete [object Object] is already a member of "${team1Name}"`);
    });

    await t.step("2.5. effects: should allow a second athlete to join the team", async () => {
      const result = await concept.addAthlete(team1Name, athlete2, team1PassKey);
      assertEquals("error" in result, false, `Should not return an error for adding a second athlete: ${result.error}`);

      // Verify effect: both athletes are in the team's athletes set
      const updatedTeam = await db.collection("TeamMembership.teams").findOne({ _id: team1._id });
      assertEquals(updatedTeam!.athletes.length, 2);
      // Use Set for robust comparison of array contents (order might not be strictly preserved by $addToSet)
      assertEquals(new Set(updatedTeam!.athletes.map(a => a._id)), new Set([athlete1._id, athlete2._id]));
    });
  });

  Deno.test("3. removeAthlete action", async (t) => {
    await t.step("3.1. effects: should successfully remove an athlete from a team", async () => {
      const result = await concept.removeAthlete(team1Name, athlete1);
      assertEquals("error" in result, false, `Should not return an error: ${result.error}`);
      assertEquals(Object.keys(result).length, 0, "Should return an empty object on success");

      // Verify effect: athlete1 is removed, athlete2 remains
      const updatedTeam = await db.collection("TeamMembership.teams").findOne({ _id: team1._id });
      assertEquals(updatedTeam!.athletes.length, 1);
      assertObjectMatch(updatedTeam!.athletes[0], athlete2); // Athlete2 should be the remaining member
    });

    await t.step("3.2. requires: should fail if the team does not exist", async () => {
      const result = await concept.removeAthlete("NonExistentTeam", athlete2);
      assertEquals("error" in result, true, "Should return an error for non-existent team");
      assertEquals((result as { error: string }).error, 'Team with name "NonExistentTeam" not found.');
    });

    await t.step("3.3. requires: should fail if the athlete is not a member of the team", async () => {
      const result = await concept.removeAthlete(team1Name, athlete1); // Athlete1 was already removed
      assertEquals("error" in result, true, "Should return an error if athlete is not a member");
      // Note: The concept's error message stringifies the entire User object
      assertEquals((result as { error: string }).error, `Athlete [object Object] is not a member of team "${team1Name}".`);
    });

    await t.step("3.4. effects: should be able to remove the last athlete from the team", async () => {
      const result = await concept.removeAthlete(team1Name, athlete2);
      assertEquals("error" in result, false, `Should not return an error for removing the last athlete: ${result.error}`);

      // Verify effect: team has no athletes left
      const updatedTeam = await db.collection("TeamMembership.teams").findOne({ _id: team1._id });
      assertEquals(updatedTeam!.athletes.length, 0);
    });
  });

  Deno.test("4. getTeamByCoach action", async (t) => {
    // Setup for query tests: Create a new team with coach1 and add athlete1
    const createQueryResult = await concept.createTeam("QueryTeam", coach1, "querypass");
    const queryTeam = (createQueryResult as { newTeam: Team }).newTeam;
    await concept.addAthlete("QueryTeam", athlete1, "querypass");

    await t.step("4.1. effects: should successfully return the team coached by a specific coach", async () => {
      const result = await concept.getTeamByCoach(coach1);
      assertEquals("error" in result, false, `Should not return an error: ${result.error}`);
      assertObjectMatch(result as Team, {
        name: "QueryTeam",
        coach: coach1,
      });
      // Verify athletes using Set for order-agnostic comparison
      assertEquals(new Set((result as Team).athletes.map(a => a._id)), new Set([athlete1._id]));
    });

    await t.step("4.2. requires: should fail if the coach does not coach any team", async () => {
      const result = await concept.getTeamByCoach(nonTeamCoach); // A coach created but never assigned a team
      assertEquals("error" in result, true, "Should return an error if coach has no team");
      // Note: The concept's error message stringifies the entire User object
      assertEquals((result as { error: string }).error, `Coach [object Object] does not have a team`);
    });
  });

  Deno.test("5. getTeamByAthlete action", async (t) => {
    // Athlete1 is already a member of "QueryTeam" from the previous step

    await t.step("5.1. effects: should successfully return the team an athlete is part of", async () => {
      const result = await concept.getTeamByAthlete(athlete1);
      assertEquals("error" in result, false, `Should not return an error: ${result.error}`);
      assertObjectMatch(result as Team, {
        name: "QueryTeam",
      });
      // Verify athletes using Set for order-agnostic comparison
      assertEquals(new Set((result as Team).athletes.map(a => a._id)), new Set([athlete1._id]));
    });

    await t.step("5.2. requires: should fail if the athlete does not belong to any team", async () => {
      const result = await concept.getTeamByAthlete(athlete3); // Athlete3 has not joined any team yet
      assertEquals("error" in result, true, "Should return an error if athlete is not in a team");
      // Note: The concept's error message stringifies the entire User object
      assertEquals((result as { error: string }).error, `Athlete [object Object] does not belong to a team`);
    });
  });

  Deno.test("6. getAthletesByTeam action", async (t) => {
    // "QueryTeam" has athlete1 from previous steps
    const teamRecord = await db.collection("TeamMembership.teams").findOne({ name: "QueryTeam" });
    const teamId = teamRecord!._id; // Get the ID of "QueryTeam"

    await t.step("6.1. effects: should successfully return a list of athletes in a team", async () => {
      const result = await concept.getAthletesByTeam(teamId);
      assertEquals("error" in result, false, `Should not return an error: ${result.error}`);
      // Verify athletes using Set for order-agnostic comparison
      assertEquals(new Set((result as User[]).map(a => a._id)), new Set([athlete1._id]));
    });

    await t.step("6.2. requires: should fail if the team does not exist", async () => {
      const nonExistentTeamId = "nonExistent" as TeamID;
      const result = await concept.getAthletesByTeam(nonExistentTeamId);
      assertEquals("error" in result, true, "Should return an error for non-existent team ID");
      assertEquals((result as { error: string }).error, `Team with id "${nonExistentTeamId}" not found.`);
    });
  });

  // trace: Demonstrates the operational principle: where a coach creates a team, then an athlete joins a team. Then try to leave the team.
  Deno.test("7. Principle Trace: Coach creates, Athlete joins, Athlete leaves", async (t) => {
    const traceCoach = createDummyUser("traceCoachId" as UserID, "coach", "traceCoach");
    const traceAthlete1 = createDummyUser("traceAthlete1Id" as UserID, "athlete", "traceAthlete1");
    const traceAthlete2 = createDummyUser("traceAthlete2Id" as UserID, "athlete", "traceAthlete2");
    const traceTeamName = "PrincipleTeam";
    const tracePassKey = "principlepass";

    let traceTeam: Team; // To store the team created in the trace

    await t.step("7.1. Coach creates a team", async () => {
      const result = await concept.createTeam(traceTeamName, traceCoach, tracePassKey);
      assertEquals("newTeam" in result, true, "Coach should successfully create a team as per principle");
      traceTeam = (result as { newTeam: Team }).newTeam; // Store the team

      // Verify the team exists and has the correct coach and no athletes
      const fetchedTeam = await concept.getTeamByCoach(traceCoach);
      assertEquals("error" in fetchedTeam, false, "Coach should be able to retrieve their newly created team");
      assertObjectMatch(fetchedTeam as Team, {
        name: traceTeamName,
        coach: traceCoach,
        athletes: [],
      });
    });

    await t.step("7.2. Athletes join the team", async () => {
      // Athlete 1 joins
      const joinResult1 = await concept.addAthlete(traceTeamName, traceAthlete1, tracePassKey);
      assertEquals("error" in joinResult1, false, "Athlete1 should successfully join the team");

      // Athlete 2 joins
      const joinResult2 = await concept.addAthlete(traceTeamName, traceAthlete2, tracePassKey);
      assertEquals("error" in joinResult2, false, "Athlete2 should successfully join the team");

      // Verify that Athlete1 is now part of the team
      const athlete1Team = await concept.getTeamByAthlete(traceAthlete1);
      assertEquals("error" in athlete1Team, false, "Athlete1 should now belong to the PrincipleTeam");
      assertObjectMatch(athlete1Team as Team, { name: traceTeamName });
      assertEquals(
        new Set((athlete1Team as Team).athletes.map(a => a._id)),
        new Set([traceAthlete1._id, traceAthlete2._id]),
        "PrincipleTeam should contain both Athlete1 and Athlete2"
      );

      // Verify the team's athlete list directly
      const athletes = await concept.getAthletesByTeam(traceTeam._id);
      assertEquals("error" in athletes, false, "Should successfully retrieve the list of athletes");
      assertEquals(
        new Set((athletes as User[]).map(a => a._id)),
        new Set([traceAthlete1._id, traceAthlete2._id]),
        "getAthletesByTeam should return both joined athletes"
      );
    });

    await t.step("7.3. Athlete leaves the team", async () => {
      // Athlete 1 leaves the team
      const leaveResult = await concept.removeAthlete(traceTeamName, traceAthlete1);
      assertEquals("error" in leaveResult, false, "Athlete1 should successfully leave the team");

      // Verify Athlete1 is no longer in the team (by checking internal state directly)
      const currentTeamState = await db.collection("TeamMembership.teams").findOne({ _id: traceTeam._id });
      assertEquals(currentTeamState!.athletes.length, 1);
      assertEquals(currentTeamState!.athletes[0]._id, traceAthlete2._id, "Athlete2 should be the only remaining member in DB");

      // Verify Athlete1 no longer belongs to any team (using getTeamByAthlete)
      const athlete1TeamCheck = await concept.getTeamByAthlete(traceAthlete1);
      assertEquals("error" in athlete1TeamCheck, true, "Athlete1 should no longer belong to a team");
      // Note: The concept's error message stringifies the entire User object
      assertEquals((athlete1TeamCheck as { error: string }).error, `Athlete [object Object] does not belong to a team`);

      // Verify Athlete2 still belongs to the team
      const athlete2TeamCheck = await concept.getTeamByAthlete(traceAthlete2);
      assertEquals("error" in athlete2TeamCheck, false, "Athlete2 should still belong to the PrincipleTeam");
      assertObjectMatch(athlete2TeamCheck as Team, { name: traceTeamName });
      assertEquals(
        new Set((athlete2TeamCheck as Team).athletes.map(a => a._id)),
        new Set([traceAthlete2._id]),
        "Athlete2's team should only contain Athlete2"
      );

      // Verify the team's athlete list via getAthletesByTeam
      const finalAthletes = await concept.getAthletesByTeam(traceTeam._id);
      assertEquals("error" in finalAthletes, false, "Should successfully retrieve the updated list of athletes");
      assertEquals(
        new Set((finalAthletes as User[]).map(a => a._id)),
        new Set([traceAthlete2._id]),
        "getAthletesByTeam should now only return Athlete2"
      );
    });
  });

  // Teardown: Close the database client
  await client.close();
});
```