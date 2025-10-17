import { assertEquals, assertObjectMatch } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import TeamMembershipConcept, {
  Team,
  TeamID,
} from "./TeamMembershipConcept.ts";
import { Role, User, UserID } from "../UserDirectory/UserDirectoryConcept.ts"; // Assuming this path for User interface

// Helper function to create dummy User objects for testing
function createDummyUser(
  id: UserID,
  user_role: Role,
  username: string,
): User {
  return {
    _id: id,
    name: username,
    email: `${username}@example.com`,
    role: user_role,
  };
}

Deno.test("TeamMembership Concept", async (t) => {
  // Setup: Initialize database and concept instance
  const [db, client] = await testDb();
  const concept = new TeamMembershipConcept(db);

  // Define dummy User objects for coaches and athletes
  const coach1: User = createDummyUser("user1" as UserID, Role.Coach, "coach1");
  const coach2: User = createDummyUser("user2" as UserID, Role.Coach, "coach2");
  const athlete1: User = createDummyUser(
    "user3" as UserID,
    Role.Athlete,
    "athlete1",
  );
  const athlete2: User = createDummyUser(
    "user4" as UserID,
    Role.Athlete,
    "athlete2",
  );
  const athlete3: User = createDummyUser(
    "user5" as UserID,
    Role.Athlete,
    "athlete3",
  ); // For testing athletes not in a team
  const nonTeamCoach: User = createDummyUser(
    "user10" as UserID,
    Role.Coach,
    "nonTeamCoach",
  ); // A coach without a team

  // Define team names and passkeys for various tests
  const team1Name = "Dragons";
  const team1PassKey = "dragonpass";
  const team2Name = "Eagles";
  const team2PassKey = "eaglepass";

  let team1: Team; // Variable to store the first created team for subsequent tests

  Deno.test("1. createTeam action", async (t) => {
    await t.step(
      "1.1. effects: should successfully create a team with a unique name and coach",
      async () => {
        const result = await concept.createTeam(
          team1Name,
          coach1,
          team1PassKey,
        );
        assertEquals(
          "newTeam" in result,
          true,
          "Should return a newTeam object on success",
        );
        team1 = (result as { newTeam: Team }).newTeam; // Store the team for later tests

        // Verify the returned team object has correct properties
        assertObjectMatch(team1, {
          name: team1Name,
          coach: coach1,
          passKey: team1PassKey,
          athletes: [], // New team should start with no athletes
        });

        // Verify the team is persisted in the database
        const fetchedTeam = await db.collection("TeamMembership.teams").findOne(
          { _id: team1._id },
        );
        assertObjectMatch(fetchedTeam!, {
          name: team1Name,
          coach: coach1,
          passKey: team1PassKey,
          athletes: [],
        });
      },
    );

    await t.step(
      "1.2. requires: should fail if a team with the same name already exists",
      async () => {
        const result = await concept.createTeam(
          team1Name,
          coach2,
          "anotherpass",
        );
        assertEquals(
          "error" in result,
          true,
          "Should return an error for duplicate team name",
        );
        assertEquals(
          (result as { error: string }).error,
          `Team with name "${team1Name}" already exists.`,
        );
      },
    );

    await t.step(
      "1.3. requires: should fail if the coach already coaches another team",
      async () => {
        const result = await concept.createTeam(
          team2Name,
          coach1,
          team2PassKey,
        );
        assertEquals(
          "error" in result,
          true,
          "Should return an error if coach already has a team",
        );
        // Note: The concept's error message stringifies the entire User object
        assertEquals(
          (result as { error: string }).error,
          `User with userId: [object Object] already coaches team "${team1Name}"`,
        );
      },
    );

    await t.step(
      "1.4. effects: should successfully create a second team with a different coach and name",
      async () => {
        const result = await concept.createTeam(
          team2Name,
          coach2,
          team2PassKey,
        );
        assertEquals(
          "newTeam" in result,
          true,
          "Should successfully create a second team",
        );
        const team2 = (result as { newTeam: Team }).newTeam;
        assertObjectMatch(team2, {
          name: team2Name,
          coach: coach2,
          passKey: team2PassKey,
          athletes: [],
        });
      },
    );
  });

  Deno.test("2. addAthlete action", async (t) => {
    await t.step(
      "2.1. effects: should successfully add an athlete to a team",
      async () => {
        const result = await concept.addAthlete(
          team1Name,
          athlete1,
          team1PassKey,
        );
        assertEquals(
          "error" in result,
          false,
          `Should not return an error: ${
            "error" in result ? (result as { error: string }).error : ""
          }`,
        );
        assertEquals(
          Object.keys(result).length,
          0,
          "Should return an empty object on success",
        );

        // Verify effect: athlete is now in the team's athletes set
        const updatedTeam = await db.collection("TeamMembership.teams").findOne(
          { _id: team1._id },
        );
        assertEquals(updatedTeam!.athletes.length, 1);
        assertObjectMatch(
          updatedTeam!.athletes[0] as unknown as Record<string, unknown>,
          athlete1 as unknown as Record<string, unknown>,
        ); // Verify the added athlete
      },
    );

    await t.step(
      "2.2. requires: should fail if the team does not exist",
      async () => {
        const result = await concept.addAthlete(
          "NonExistentTeam",
          athlete2,
          "pass",
        );
        assertEquals(
          "error" in result,
          true,
          "Should return an error for non-existent team",
        );
        assertEquals(
          (result as { error: string }).error,
          'Team with name "NonExistentTeam" not found.',
        );
      },
    );

    await t.step(
      "2.3. requires: should fail if the passKey is incorrect",
      async () => {
        const result = await concept.addAthlete(
          team1Name,
          athlete2,
          "wrongpass",
        );
        assertEquals(
          "error" in result,
          true,
          "Should return an error for invalid passKey",
        );
        assertEquals(
          (result as { error: string }).error,
          "Invalid passKey for this team.",
        );
      },
    );

    await t.step(
      "2.4. requires: should fail if the athlete is already a member of the team",
      async () => {
        const result = await concept.addAthlete(
          team1Name,
          athlete1,
          team1PassKey,
        );
        assertEquals(
          "error" in result,
          true,
          "Should return an error if athlete is already a member",
        );
        // Note: The concept's error message stringifies the entire User object
        assertEquals(
          (result as { error: string }).error,
          `Athlete [object Object] is already a member of "${team1Name}"`,
        );
      },
    );

    await t.step(
      "2.5. effects: should allow a second athlete to join the team",
      async () => {
        const result = await concept.addAthlete(
          team1Name,
          athlete2,
          team1PassKey,
        );
        assertEquals(
          "error" in result,
          false,
          `Should not return an error for adding a second athlete: ${
            "error" in result ? (result as { error: string }).error : ""
          }`,
        );

        // Verify effect: both athletes are in the team's athletes set
        const updatedTeam = await db.collection("TeamMembership.teams").findOne(
          { _id: team1._id },
        );
        assertEquals(updatedTeam!.athletes.length, 2);
        // Use Set for robust comparison of array contents (order might not be strictly preserved by $addToSet)
        assertEquals(
          new Set(updatedTeam!.athletes.map((a: User) => a._id)),
          new Set([athlete1._id, athlete2._id]),
        );
      },
    );
  });

  Deno.test("3. removeAthlete action", async (t) => {
    await t.step(
      "3.1. effects: should successfully remove an athlete from a team",
      async () => {
        const result = await concept.removeAthlete(team1Name, athlete1);
        assertEquals(
          "error" in result,
          false,
          `Should not return an error: ${
            "error" in result ? (result as { error: string }).error : ""
          }`,
        );
        assertEquals(
          Object.keys(result).length,
          0,
          "Should return an empty object on success",
        );

        // Verify effect: athlete1 is removed, athlete2 remains
        const updatedTeam = await db.collection("TeamMembership.teams").findOne(
          { _id: team1._id },
        );
        assertEquals(updatedTeam!.athletes.length, 1);
        assertObjectMatch(
          updatedTeam!.athletes[0] as unknown as Record<string, unknown>,
          athlete2 as unknown as Record<string, unknown>,
        ); // Athlete2 should be the remaining member
      },
    );

    await t.step(
      "3.2. requires: should fail if the team does not exist",
      async () => {
        const result = await concept.removeAthlete("NonExistentTeam", athlete2);
        assertEquals(
          "error" in result,
          true,
          "Should return an error for non-existent team",
        );
        assertEquals(
          (result as { error: string }).error,
          'Team with name "NonExistentTeam" not found.',
        );
      },
    );

    await t.step(
      "3.3. requires: should fail if the athlete is not a member of the team",
      async () => {
        const result = await concept.removeAthlete(team1Name, athlete1); // Athlete1 was already removed
        assertEquals(
          "error" in result,
          true,
          "Should return an error if athlete is not a member",
        );
        // Note: The concept's error message stringifies the entire User object
        assertEquals(
          (result as { error: string }).error,
          `Athlete [object Object] is not a member of team "${team1Name}".`,
        );
      },
    );

    await t.step(
      "3.4. effects: should be able to remove the last athlete from the team",
      async () => {
        const result = await concept.removeAthlete(team1Name, athlete2);
        assertEquals(
          "error" in result,
          false,
          `Should not return an error for removing the last athlete: ${result.error}`,
        );

        // Verify effect: team has no athletes left
        const updatedTeam = await db.collection("TeamMembership.teams").findOne(
          { _id: team1._id },
        );
        assertEquals(updatedTeam!.athletes.length, 0);
      },
    );
  });

  Deno.test("4. getTeamByCoach action", async (t) => {
    // Setup for query tests: Create a new team with coach1 and add athlete1
    const createQueryResult = await concept.createTeam(
      "QueryTeam",
      coach1,
      "querypass",
    );
    const queryTeam = (createQueryResult as { newTeam: Team }).newTeam;
    await concept.addAthlete("QueryTeam", athlete1, "querypass");

    await t.step(
      "4.1. effects: should successfully return the team coached by a specific coach",
      async () => {
        const result = await concept.getTeamByCoach(coach1);
        assertEquals(
          "error" in result,
          false,
          `Should not return an error: ${
            "error" in result ? (result as { error: string }).error : ""
          }`,
        );
        assertObjectMatch(result as Team, {
          name: "QueryTeam",
          coach: coach1,
        });
        // Verify athletes using Set for order-agnostic comparison
        assertEquals(
          new Set((result as Team).athletes.map((a: User) => a._id)),
          new Set([athlete1._id]),
        );
      },
    );

    await t.step(
      "4.2. requires: should fail if the coach does not coach any team",
      async () => {
        const result = await concept.getTeamByCoach(nonTeamCoach); // A coach created but never assigned a team
        assertEquals(
          "error" in result,
          true,
          "Should return an error if coach has no team",
        );
        // Note: The concept's error message stringifies the entire User object
        assertEquals(
          (result as { error: string }).error,
          `Coach [object Object] does not have a team`,
        );
      },
    );
  });

  Deno.test("5. getTeamByAthlete action", async (t) => {
    // Athlete1 is already a member of "QueryTeam" from the previous step

    await t.step(
      "5.1. effects: should successfully return the team an athlete is part of",
      async () => {
        const result = await concept.getTeamByAthlete(athlete1);
        assertEquals(
          "error" in result,
          false,
          `Should not return an error: ${
            "error" in result ? (result as { error: string }).error : ""
          }`,
        );
        assertObjectMatch(result as Team, {
          name: "QueryTeam",
        });
        // Verify athletes using Set for order-agnostic comparison
        assertEquals(
          new Set((result as Team).athletes.map((a) => a._id)),
          new Set([athlete1._id]),
        );
      },
    );

    await t.step(
      "5.2. requires: should fail if the athlete does not belong to any team",
      async () => {
        const result = await concept.getTeamByAthlete(athlete3); // Athlete3 has not joined any team yet
        assertEquals(
          "error" in result,
          true,
          "Should return an error if athlete is not in a team",
        );
        // Note: The concept's error message stringifies the entire User object
        assertEquals(
          (result as { error: string }).error,
          `Athlete [object Object] does not belong to a team`,
        );
      },
    );
  });

  Deno.test("6. getAthletesByTeam action", async (t) => {
    // "QueryTeam" has athlete1 from previous steps
    const teamRecord = await db.collection("TeamMembership.teams").findOne({
      name: "QueryTeam",
    });
    const teamId = teamRecord!._id; // Get the ID of "QueryTeam"

    await t.step(
      "6.1. effects: should successfully return a list of athletes in a team",
      async () => {
        const result = await concept.getAthletesByTeam(
          teamId as unknown as TeamID,
        );
        assertEquals(
          "error" in result,
          false,
          `Should not return an error: ${
            "error" in result ? (result as { error: string }).error : ""
          }`,
        );
        // Verify athletes using Set for order-agnostic comparison
        assertEquals(
          new Set((result as User[]).map((a: User) => a._id)),
          new Set([athlete1._id]),
        );
      },
    );

    await t.step(
      "6.2. requires: should fail if the team does not exist",
      async () => {
        const nonExistentTeamId = "nonExistent" as TeamID;
        const result = await concept.getAthletesByTeam(nonExistentTeamId);
        assertEquals(
          "error" in result,
          true,
          "Should return an error for non-existent team ID",
        );
        assertEquals(
          (result as { error: string }).error,
          `Team with id "${nonExistentTeamId}" not found.`,
        );
      },
    );
  });

  // trace: Demonstrates the operational principle: where a coach creates a team, then an athlete joins a team. Then try to leave the team.
  Deno.test("7. Principle Trace: Coach creates, Athlete joins, Athlete leaves", async (t) => {
    const traceCoach = createDummyUser(
      "traceCoachId" as UserID,
      Role.Coach,
      "traceCoach",
    );
    const traceAthlete1 = createDummyUser(
      "traceAthlete1Id" as UserID,
      Role.Athlete,
      "traceAthlete1"
    );
    const traceAthlete2 = createDummyUser(
      "traceAthlete2Id" as UserID,
      Role.Athlete,
      "traceAthlete2",
    );
    const traceTeamName = "PrincipleTeam";
    const tracePassKey = "principlepass";

    let traceTeam: Team; // To store the team created in the trace

    await t.step("7.1. Coach creates a team", async () => {
      const result = await concept.createTeam(
        traceTeamName,
        traceCoach,
        tracePassKey,
      );
      assertEquals(
        "newTeam" in result,
        true,
        "Coach should successfully create a team as per principle",
      );
      traceTeam = (result as { newTeam: Team }).newTeam; // Store the team

      // Verify the team exists and has the correct coach and no athletes
      const fetchedTeam = await concept.getTeamByCoach(traceCoach);
      assertEquals(
        "error" in fetchedTeam,
        false,
        "Coach should be able to retrieve their newly created team",
      );
      assertObjectMatch(fetchedTeam as Team, {
        name: traceTeamName,
        coach: traceCoach,
        athletes: [],
      });
    });

    await t.step("7.2. Athletes join the team", async () => {
      // Athlete 1 joins
      const joinResult1 = await concept.addAthlete(
        traceTeamName,
        traceAthlete1,
        tracePassKey,
      );
      assertEquals(
        "error" in joinResult1,
        false,
        "Athlete1 should successfully join the team",
      );

      // Athlete 2 joins
      const joinResult2 = await concept.addAthlete(
        traceTeamName,
        traceAthlete2,
        tracePassKey,
      );
      assertEquals(
        "error" in joinResult2,
        false,
        "Athlete2 should successfully join the team",
      );

      // Verify that Athlete1 is now part of the team
      const athlete1Team = await concept.getTeamByAthlete(traceAthlete1);
      assertEquals(
        "error" in athlete1Team,
        false,
        "Athlete1 should now belong to the PrincipleTeam",
      );
      assertObjectMatch(athlete1Team as Team, { name: traceTeamName });
      assertEquals(
        new Set((athlete1Team as Team).athletes.map((a) => a._id)),
        new Set([traceAthlete1._id, traceAthlete2._id]),
        "PrincipleTeam should contain both Athlete1 and Athlete2",
      );

      // Verify the team's athlete list directly
      const athletes = await concept.getAthletesByTeam(traceTeam._id);
      assertEquals(
        "error" in athletes,
        false,
        "Should successfully retrieve the list of athletes",
      );
      assertEquals(
        new Set((athletes as User[]).map((a) => a._id)),
        new Set([traceAthlete1._id, traceAthlete2._id]),
        "getAthletesByTeam should return both joined athletes",
      );
    });

    await t.step("7.3. Athlete leaves the team", async () => {
      // Athlete 1 leaves the team
      const leaveResult = await concept.removeAthlete(
        traceTeamName,
        traceAthlete1,
      );
      assertEquals(
        "error" in leaveResult,
        false,
        "Athlete1 should successfully leave the team",
      );

      // Verify Athlete1 is no longer in the team (by checking internal state directly)
      const currentTeamState = await db.collection("TeamMembership.teams")
        .findOne({ _id: traceTeam._id });
      assertEquals(currentTeamState!.athletes.length, 1);
      assertEquals(
        currentTeamState!.athletes[0]._id,
        traceAthlete2._id,
        "Athlete2 should be the only remaining member in DB",
      );

      // Verify Athlete1 no longer belongs to any team (using getTeamByAthlete)
      const athlete1TeamCheck = await concept.getTeamByAthlete(traceAthlete1);
      assertEquals(
        "error" in athlete1TeamCheck,
        true,
        "Athlete1 should no longer belong to a team",
      );
      // Note: The concept's error message stringifies the entire User object
      assertEquals(
        (athlete1TeamCheck as { error: string }).error,
        `Athlete [object Object] does not belong to a team`,
      );

      // Verify Athlete2 still belongs to the team
      const athlete2TeamCheck = await concept.getTeamByAthlete(traceAthlete2);
      assertEquals(
        "error" in athlete2TeamCheck,
        false,
        "Athlete2 should still belong to the PrincipleTeam",
      );
      assertObjectMatch(athlete2TeamCheck as Team, { name: traceTeamName });
      assertEquals(
        new Set((athlete2TeamCheck as Team).athletes.map((a) => a._id)),
        new Set([traceAthlete2._id]),
        "Athlete2's team should only contain Athlete2",
      );

      // Verify the team's athlete list via getAthletesByTeam
      const finalAthletes = await concept.getAthletesByTeam(traceTeam._id);
      assertEquals(
        "error" in finalAthletes,
        false,
        "Should successfully retrieve the updated list of athletes",
      );
      assertEquals(
        new Set((finalAthletes as User[]).map((a) => a._id)),
        new Set([traceAthlete2._id]),
        "getAthletesByTeam should now only return Athlete2",
      );
    });
  });

  // Teardown: Close the database client
  await client.close();
});
