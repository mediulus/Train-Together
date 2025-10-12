import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert";

import { testDb } from "@utils/database.ts";
import UserDirectoryConcept, {
  Role,
  Gender,
} from "./UserDirectoryConcept.ts";

Deno.test("Principle: register users → set/query mileage → list athletes by gender", async (t) => {
  const [db, client] = await testDb();
  const concept = new UserDirectoryConcept(db);

  try {
    let athleteId: string;
    let coachId: string;

    await t.step("register an athlete and a coach", async () => {
      const resAthlete = await concept.register({
        email: "alice@example.com",
        name: "Alice Athlete",
        password: "pass",
        role: Role.Athlete,
        gender: Gender.Female,
      });
      assertEquals("error" in resAthlete, false, "athlete registration should succeed");
      athleteId = (resAthlete as { user: string }).user;
      assertExists(athleteId);

      const resCoach = await concept.register({
        email: "cory@example.com",
        name: "Cory Coach",
        password: "pass",
        role: Role.Coach,
        gender: Gender.Male,
      });
      assertEquals("error" in resCoach, false, "coach registration should succeed");
      coachId = (resCoach as { user: string }).user;
      assertExists(coachId);
    });

    await t.step("effects: athlete weeklyMileage defaults to 0; coach weeklyMileage is null", async () => {
      const athleteMileage = await concept.getAthleteMileage({ user_id: athleteId as any });
      assertEquals("error" in athleteMileage, false, "athlete mileage query should succeed");
      assertEquals((athleteMileage as { weeklyMileage: number | null }).weeklyMileage, 0);

      const coachMileage = await concept.getAthleteMileage({ user_id: coachId as any });
      assertEquals("error" in coachMileage, true, "coach should not have athlete mileage");
    });

    await t.step("setWeeklyMileage succeeds for athlete", async () => {
      const upd = await concept.setWeeklyMileage({ user_id: athleteId as any, weeklyMileage: 42 });
      assertEquals("error" in upd, false, "setting athlete mileage should succeed");

      const after = await concept.getAthleteMileage({ user_id: athleteId as any });
      assertEquals("error" in after, false);
      assertEquals((after as { weeklyMileage: number | null }).weeklyMileage, 42);
    });

    await t.step("setWeeklyMileage fails for non-athlete", async () => {
      const upd = await concept.setWeeklyMileage({ user_id: coachId as any, weeklyMileage: 10 });
      assertEquals("error" in upd, true, "only athletes can have weekly mileage set");
    });

    await t.step("getAthletesByGender filters correctly", async () => {
      // Add a second athlete of a different gender
      const resAthlete2 = await concept.register({
        email: "bob@example.com",
        name: "Bob Runner",
        password: "pass",
        role: Role.Athlete,
        gender: Gender.Male,
      });
      assertEquals("error" in resAthlete2, false);

      const females = await concept.getAthletesByGender({ gender: Gender.Female });
      assertEquals("error" in females, false);
      const femaleList = (females as { athletes: any[] }).athletes;
      assertEquals(
        femaleList.every((u) => u.role === Role.Athlete && u.gender === Gender.Female),
        true,
        "all returned users should be female athletes",
      );

      const males = await concept.getAthletesByGender({ gender: Gender.Male });
      assertEquals("error" in males, false);
      const maleList = (males as { athletes: any[] }).athletes;
      assertEquals(
        maleList.every((u) => u.role === Role.Athlete && u.gender === Gender.Male),
        true,
        "all returned users should be male athletes",
      );
    });
  } finally {
    await client.close();
  }
});

Deno.test("Action: register enforces unique email", async () => {
  const [db, client] = await testDb();
  const concept = new UserDirectoryConcept(db);

  try {
    const first = await concept.register({
      email: "dup@example.com",
      name: "First",
      password: "x",
      role: Role.Athlete,
      gender: Gender.Female,
    });
    assertEquals("error" in first, false, "first registration should succeed");

    const second = await concept.register({
      email: "dup@example.com",
      name: "Second",
      password: "y",
      role: Role.Coach,
      gender: Gender.Male,
    });
    assertEquals("error" in second, true, "duplicate email should fail");
  } finally {
    await client.close();
  }
});

Deno.test("Action/Query: setWeeklyMileage and getAthleteMileage enforce requirements", async () => {
  const [db, client] = await testDb();
  const concept = new UserDirectoryConcept(db);

  try {
    // Non-existent user
    const updMissing = await concept.setWeeklyMileage({ user_id: "user:fake" as any, weeklyMileage: 12 });
    assertEquals("error" in updMissing, true, "updating mileage for missing user should fail");

    // Register a coach and verify getAthleteMileage returns error
    const coach = await concept.register({
      email: "coachx@example.com",
      name: "Coach X",
      password: "p",
      role: Role.Coach,
      gender: Gender.Male,
    });
    const coachId = (coach as { user: string }).user;

    const coachMiles = await concept.getAthleteMileage({ user_id: coachId as any });
    assertEquals("error" in coachMiles, true, "coach should not have athlete mileage");
  } finally {
    await client.close();
  }
});
