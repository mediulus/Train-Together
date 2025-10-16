---
timestamp: 'Wed Oct 15 2025 15:12:26 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251015_151226.c406183b.md]]'
content_id: c582c47d32dae1237a2b04d279bef7036f85ccc16e01c8e26011affd02e8858a
---

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
