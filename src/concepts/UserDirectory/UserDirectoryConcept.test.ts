import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertNotEquals,
  assertObjectMatch,
} from "jsr:@std/assert";
import { Collection, Db } from "npm:mongodb";
import { testDb } from "@utils/database.ts";
import { OAuth2Client } from "google-auth-library";
import { Gender, Role, User, UserID } from "./UserDirectoryConcept.ts"; // Assuming UserDirectoryConcept.ts is the file with the concept
import UserDirectoryConcept from "./UserDirectoryConcept.ts";

// Mock the OAuth2Client to avoid actual Google API calls
class MockOAuth2Client extends OAuth2Client {
  private mockPayload: any | null = null;

  constructor(clientId: string) {
    super(clientId);
  }

  setMockPayload(payload: any) {
    this.mockPayload = payload;
  }

  override async verifyIdToken(
    options: { idToken: string; audience: string | string[] },
  ): Promise<any> {
    if (this.mockPayload) {
      return {
        getPayload: () => this.mockPayload,
      };
    }
    // Simulate invalid token if no payload is set
    return {
      getPayload: () => null,
    };
  }
}

Deno.test("UserDirectoryConcept", async (t) => {
  const [db, client] = await testDb();
  const GOOGLE_CLIENT_ID = "mock-google-client-id";
  const mockOauthClient = new MockOAuth2Client(GOOGLE_CLIENT_ID);
  const concept = new UserDirectoryConcept(db, {
    oauthClient: mockOauthClient,
    googleClientId: GOOGLE_CLIENT_ID,
  });

  // Access the users collection for direct assertions
  const usersCollection: Collection<User> = db.collection(
    "UserDirectory.users",
  );

  await t.step(
    "Action: loginWithGoogleIdToken - `requires` and `effects`",
    async (st) => {
      await st.step(
        "requires: valid google idToken - should return error for missing idToken",
        async () => {
          const result = await concept.loginWithGoogleIdToken("");
          assertObjectMatch(result, { error: "Missing idToken." });
        },
      );

      await st.step(
        "requires: valid google idToken - should return error for invalid token",
        async () => {
          mockOauthClient.setMockPayload(null); // Simulate invalid token
          const result = await concept.loginWithGoogleIdToken("invalid-token");
          assertObjectMatch(result, { error: "Invalid Google token." });
        },
      );

      await st.step(
        "requires: valid google idToken - should return error if email not verified",
        async () => {
          mockOauthClient.setMockPayload({
            sub: "google-sub-unverified",
            email: "unverified@example.com",
            email_verified: false,
            name: "Unverified User",
          });
          const result = await concept.loginWithGoogleIdToken(
            "valid-but-unverified-token",
          );
          assertObjectMatch(result, {
            error: "Google email must be verified.",
          });
        },
      );

      await st.step("effects: generates a new user", async () => {
        const email = "newuser@example.com";
        const name = "New User";
        mockOauthClient.setMockPayload({
          sub: "google-sub-1",
          email: email,
          email_verified: true,
          name: name,
        });

        const result = await concept.loginWithGoogleIdToken("valid-token-1");
        assertExists(result);
        assertNotEquals(
          (result as any).error,
          "Expected success, got error: " + (result as any).error,
        );
        const { userId, needsName, needsRole } = result as {
          userId: UserID;
          needsName: boolean;
          needsRole: boolean;
        };

        assertExists(userId);
        assertEquals(
          needsName,
          false,
          "Name should be pre-filled from Google profile",
        );
        assertEquals(needsRole, true, "New user needs a role");

        const userInDb = await usersCollection.findOne({ _id: userId });
        assertExists(userInDb);
        assertEquals(userInDb._id, userId);
        assertEquals(userInDb.email, email);
        assertEquals(userInDb.name, name);
        assertEquals(userInDb.role, null);
        assertEquals(userInDb.google?.sub, "google-sub-1");
        assertInstanceOf(userInDb.lastLoginAt, Date);
      });

      await st.step(
        "effects: handles returning user (updates lastLoginAt, doesn't need name/role if already set)",
        async () => {
          const email = "returninguser@example.com";
          const name = "Returning User";
          mockOauthClient.setMockPayload({
            sub: "google-sub-2",
            email: email,
            email_verified: true,
            name: name,
          });

          // First login (new user)
          const firstLoginResult = await concept.loginWithGoogleIdToken(
            "valid-token-2-first",
          );
          const { userId: firstUserId } = firstLoginResult as {
            userId: UserID;
          };
          await concept.setName(firstUserId, name);
          await concept.setRole(firstUserId, Role.Athlete);
          await concept.setGender(firstUserId, Gender.Female);
          await concept.setWeeklyMileage(firstUserId, 50);

          const userBeforeSecondLogin = await usersCollection.findOne({
            _id: firstUserId,
          });
          const lastLoginAtBefore = userBeforeSecondLogin?.lastLoginAt;

          // Simulate a time delay for second login
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Second login (returning user)
          const secondLoginResult = await concept.loginWithGoogleIdToken(
            "valid-token-2-second",
          );
          assertExists(secondLoginResult);
          assertNotEquals(
            (secondLoginResult as any).error,
            "Expected success, got error: " + (secondLoginResult as any).error,
          );

          const { userId, needsName, needsRole } = secondLoginResult as {
            userId: UserID;
            needsName: boolean;
            needsRole: boolean;
          };

          assertEquals(
            userId,
            firstUserId,
            "Returning user ID should be the same",
          );
          assertEquals(
            needsName,
            false,
            "Returning user should not need name if already set",
          );
          assertEquals(
            needsRole,
            false,
            "Returning user should not need role if already set",
          );

          const userAfterSecondLogin = await usersCollection.findOne({
            _id: userId,
          });
          assertExists(userAfterSecondLogin);
          assertEquals(userAfterSecondLogin.email, email);
          assertEquals(userAfterSecondLogin.name, name);
          assertEquals(userAfterSecondLogin.role, Role.Athlete);
          assertNotEquals(
            userAfterSecondLogin.lastLoginAt,
            lastLoginAtBefore,
            "lastLoginAt should be updated",
          );
        },
      );
    },
  );

  await t.step("Action: getUser - `requires` and `effects`", async (st) => {
    let testUserId: UserID;
    await st.step("Setup: Create a user", async () => {
      mockOauthClient.setMockPayload({
        sub: "google-sub-getuser",
        email: "getuser@example.com",
        email_verified: true,
        name: "Get User Test",
      });
      const { userId } = await concept.loginWithGoogleIdToken(
        "token-getuser",
      ) as { userId: UserID };
      testUserId = userId;
    });

    await st.step(
      "requires: User exists - should return error for non-existent user",
      async () => {
        const nonExistentId: UserID = "non-existent-id" as UserID;
        const result = await concept.getUser(nonExistentId);
        assertObjectMatch(result, { error: "this user does not exists" });
      },
    );

    await st.step("effects: returns the user for an existing ID", async () => {
      const user = await concept.getUser(testUserId) as User;
      assertExists(user);
      assertEquals(user._id, testUserId);
      assertEquals(user.email, "getuser@example.com");
    });
  });

  await t.step("Action: setName - `requires` and `effects`", async (st) => {
    let testUserId: UserID;
    await st.step("Setup: Create a user without a name pre-set", async () => {
      mockOauthClient.setMockPayload({
        sub: "google-sub-setname",
        email: "setname@example.com",
        email_verified: true,
        name: null, // Simulate no name from Google profile
      });
      const { userId } = await concept.loginWithGoogleIdToken(
        "token-setname",
      ) as { userId: UserID };
      testUserId = userId;
      const user = await concept.getUser(testUserId) as User;
      assertEquals(user.name, null);
    });

    await st.step(
      "requires: user exists - should return error for non-existent user",
      async () => {
        const nonExistentId: UserID = "non-existent-id-setname" as UserID;
        const result = await concept.setName(nonExistentId, "Invalid Name");
        assertObjectMatch(result, { error: "User not found." });
      },
    );

    await st.step(
      "requires: name is not empty - should return error for empty name",
      async () => {
        const result = await concept.setName(testUserId, "");
        assertObjectMatch(result, { error: "Name cannot be empty." });
      },
    );

    await st.step(
      "effects: user.name = name - sets the user's name",
      async () => {
        const newName = "Alice Wonderland";
        const result = await concept.setName(testUserId, newName);
        assertObjectMatch(result, {}); // Empty object means success
        const user = await usersCollection.findOne({ _id: testUserId });
        assertExists(user);
        assertEquals(user.name, newName);
      },
    );
  });

  await t.step("Action: setRole - `requires` and `effects`", async (st) => {
    let testUserId: UserID;
    await st.step("Setup: Create a user", async () => {
      mockOauthClient.setMockPayload({
        sub: "google-sub-setrole",
        email: "setrole@example.com",
        email_verified: true,
        name: "Role Setter",
      });
      const { userId } = await concept.loginWithGoogleIdToken(
        "token-setrole",
      ) as { userId: UserID };
      testUserId = userId;
    });

    await st.step(
      "requires: user exists - should return error for non-existent user",
      async () => {
        const nonExistentId: UserID = "non-existent-id-setrole" as UserID;
        const result = await concept.setRole(nonExistentId, Role.Athlete);
        assertObjectMatch(result, { error: "User not found." });
      },
    );

    await st.step(
      "requires: role is valid - should return error for invalid role",
      async () => {
        const result = await concept.setRole(
          testUserId,
          "invalid-role" as Role,
        );
        assertObjectMatch(result, { error: "Invalid role." });
      },
    );

    await st.step(
      "effects: user.role = role - sets the user's role to athlete",
      async () => {
        const result = await concept.setRole(testUserId, Role.Athlete);
        assertObjectMatch(result, {});
        const user = await usersCollection.findOne({ _id: testUserId });
        assertExists(user);
        assertEquals(user.role, Role.Athlete);
      },
    );

    await st.step(
      "effects: user.role = role - changes the user's role to coach",
      async () => {
        const result = await concept.setRole(testUserId, Role.Coach);
        assertObjectMatch(result, {});
        const user = await usersCollection.findOne({ _id: testUserId });
        assertExists(user);
        assertEquals(user.role, Role.Coach);
      },
    );
  });

  await t.step("Action: setGender - `requires` and `effects`", async (st) => {
    let testUserId: UserID;
    await st.step("Setup: Create a user", async () => {
      mockOauthClient.setMockPayload({
        sub: "google-sub-setgender",
        email: "setgender@example.com",
        email_verified: true,
        name: "Gender Setter",
      });
      const { userId } = await concept.loginWithGoogleIdToken(
        "token-setgender",
      ) as { userId: UserID };
      testUserId = userId;
    });

    await st.step(
      "requires: user exists - should return error for non-existent user",
      async () => {
        const nonExistentId: UserID = "non-existent-id-setgender" as UserID;
        const result = await concept.setGender(nonExistentId, Gender.Female);
        assertObjectMatch(result, { error: "User not found." });
      },
    );

    await st.step(
      "effects: user.gender = gender - sets the user's gender to female",
      async () => {
        const result = await concept.setGender(testUserId, Gender.Female);
        assertObjectMatch(result, {});
        const user = await usersCollection.findOne({ _id: testUserId });
        assertExists(user);
        assertEquals(user.gender, Gender.Female);
      },
    );

    await st.step(
      "effects: user.gender = gender - changes the user's gender to male",
      async () => {
        const result = await concept.setGender(testUserId, Gender.Male);
        assertObjectMatch(result, {});
        const user = await usersCollection.findOne({ _id: testUserId });
        assertExists(user);
        assertEquals(user.gender, Gender.Male);
      },
    );
  });

  await t.step(
    "Action: setWeeklyMileage - `requires` and `effects`",
    async (st) => {
      let athleteUserId: UserID;
      let coachUserId: UserID;

      await st.step("Setup: Create an athlete and a coach", async () => {
        mockOauthClient.setMockPayload({
          sub: "google-sub-athlete",
          email: "athlete@example.com",
          email_verified: true,
          name: "Athletes Miles",
        });
        const { userId: athleteId } = await concept.loginWithGoogleIdToken(
          "token-athlete",
        ) as { userId: UserID };
        athleteUserId = athleteId;
        await concept.setRole(athleteUserId, Role.Athlete);

        mockOauthClient.setMockPayload({
          sub: "google-sub-coach",
          email: "coach@example.com",
          email_verified: true,
          name: "Coaches Miles",
        });
        const { userId: coachId } = await concept.loginWithGoogleIdToken(
          "token-coach",
        ) as { userId: UserID };
        coachUserId = coachId;
        await concept.setRole(coachUserId, Role.Coach);
      });

      await st.step(
        "requires: User exists - should return error for non-existent user",
        async () => {
          const nonExistentId: UserID = "non-existent-id-setmileage" as UserID;
          const result = await concept.setWeeklyMileage(nonExistentId, 100);
          assertObjectMatch(result, { error: "User not found." });
        },
      );

      await st.step(
        "requires: user.role = athlete - should return error for a coach user",
        async () => {
          const result = await concept.setWeeklyMileage(coachUserId, 75);
          assertObjectMatch(result, {
            error: "Only athletes can have weekly mileage set.",
          });
        },
      );

      await st.step(
        "effects: user.weeklyMileage = weeklyMileage - sets an athlete's mileage",
        async () => {
          const mileage = 65;
          const result = await concept.setWeeklyMileage(athleteUserId, mileage);
          assertObjectMatch(result, {});
          const user = await usersCollection.findOne({ _id: athleteUserId });
          assertExists(user);
          assertEquals(user.weeklyMileage, mileage);
        },
      );

      await st.step(
        "effects: user.weeklyMileage = weeklyMileage - updates an athlete's mileage",
        async () => {
          const newMileage = 70;
          const result = await concept.setWeeklyMileage(
            athleteUserId,
            newMileage,
          );
          assertObjectMatch(result, {});
          const user = await usersCollection.findOne({ _id: athleteUserId });
          assertExists(user);
          assertEquals(user.weeklyMileage, newMileage);
        },
      );
    },
  );

  await t.step(
    "Action: getAthleteMileage - `requires` and `effects`",
    async (st) => {
      let athleteUserId: UserID;
      let coachUserId: UserID;

      await st.step("Setup: Create an athlete and a coach", async () => {
        mockOauthClient.setMockPayload({
          sub: "google-sub-getmileage-athlete",
          email: "getmileage_athlete@example.com",
          email_verified: true,
          name: "Get Mileage Athlete",
        });
        const { userId: athleteId } = await concept.loginWithGoogleIdToken(
          "token-getmileage-athlete",
        ) as { userId: UserID };
        athleteUserId = athleteId;
        await concept.setRole(athleteUserId, Role.Athlete);
        await concept.setWeeklyMileage(athleteUserId, 42);

        mockOauthClient.setMockPayload({
          sub: "google-sub-getmileage-coach",
          email: "getmileage_coach@example.com",
          email_verified: true,
          name: "Get Mileage Coach",
        });
        const { userId: coachId } = await concept.loginWithGoogleIdToken(
          "token-getmileage-coach",
        ) as { userId: UserID };
        coachUserId = coachId;
        await concept.setRole(coachUserId, Role.Coach);
      });

      await st.step(
        "requires: User exists - should return error for non-existent user",
        async () => {
          const nonExistentId: UserID = "non-existent-id-getmileage" as UserID;
          const result = await concept.getAthleteMileage(nonExistentId);
          assertObjectMatch(result, { error: "User not found." });
        },
      );

      await st.step(
        "requires: user.role = athlete - should return error for a coach user",
        async () => {
          const result = await concept.getAthleteMileage(coachUserId);
          assertObjectMatch(result, {
            error: "Only athletes have weekly mileage.",
          });
        },
      );

      await st.step(
        "effects: returns the users weeklyMileage - for an athlete with mileage",
        async () => {
          const result = await concept.getAthleteMileage(athleteUserId) as {
            weeklyMileage: number;
          };
          assertObjectMatch(result, { weeklyMileage: 42 });
        },
      );

      await st.step(
        "effects: returns the users weeklyMileage - for an athlete without mileage (should be null)",
        async () => {
          mockOauthClient.setMockPayload({
            sub: "google-sub-athlete-no-mileage",
            email: "athlete_nomileage@example.com",
            email_verified: true,
            name: "No Mileage",
          });
          const { userId: noMileageAthleteId } = await concept
            .loginWithGoogleIdToken("token-no-mileage") as { userId: UserID };
          await concept.setRole(noMileageAthleteId, Role.Athlete);
          // Don't set mileage

          const result = await concept.getAthleteMileage(
            noMileageAthleteId,
          ) as { weeklyMileage: number | null };
          assertObjectMatch(result, { weeklyMileage: null });
        },
      );
    },
  );

  await t.step(
    "Action: getAthletesByGender - `requires` and `effects`",
    async (st) => {
      let femaleAthlete1Id: UserID,
        femaleAthlete2Id: UserID,
        maleAthlete1Id: UserID,
        coachId: UserID;

      await st.step(
        "Setup: Create multiple users with different roles/genders",
        async () => {
          // Female Athlete 1
          mockOauthClient.setMockPayload({
            sub: "google-sub-fa1",
            email: "fa1@example.com",
            email_verified: true,
            name: "Female Athlete 1",
          });
          const { userId: fa1 } = await concept.loginWithGoogleIdToken(
            "token-fa1",
          ) as { userId: UserID };
          femaleAthlete1Id = fa1;
          await concept.setRole(femaleAthlete1Id, Role.Athlete);
          await concept.setGender(femaleAthlete1Id, Gender.Female);
          await concept.setWeeklyMileage(femaleAthlete1Id, 30);

          // Female Athlete 2
          mockOauthClient.setMockPayload({
            sub: "google-sub-fa2",
            email: "fa2@example.com",
            email_verified: true,
            name: "Female Athlete 2",
          });
          const { userId: fa2 } = await concept.loginWithGoogleIdToken(
            "token-fa2",
          ) as { userId: UserID };
          femaleAthlete2Id = fa2;
          await concept.setRole(femaleAthlete2Id, Role.Athlete);
          await concept.setGender(femaleAthlete2Id, Gender.Female);
          await concept.setWeeklyMileage(femaleAthlete2Id, 45);

          // Male Athlete 1
          mockOauthClient.setMockPayload({
            sub: "google-sub-ma1",
            email: "ma1@example.com",
            email_verified: true,
            name: "Male Athlete 1",
          });
          const { userId: ma1 } = await concept.loginWithGoogleIdToken(
            "token-ma1",
          ) as { userId: UserID };
          maleAthlete1Id = ma1;
          await concept.setRole(maleAthlete1Id, Role.Athlete);
          await concept.setGender(maleAthlete1Id, Gender.Male);
          await concept.setWeeklyMileage(maleAthlete1Id, 60);

          // Coach
          mockOauthClient.setMockPayload({
            sub: "google-sub-gc",
            email: "coach_gender@example.com",
            email_verified: true,
            name: "Gender Coach",
          });
          const { userId: cId } = await concept.loginWithGoogleIdToken(
            "token-gc",
          ) as { userId: UserID };
          coachId = cId;
          await concept.setRole(coachId, Role.Coach);
        },
      );

      await st.step(
        "requires: there are athletes and athletes with that gender - should return empty array if no athletes of that gender",
        async () => {
          // Create an athlete without gender
          mockOauthClient.setMockPayload({
            sub: "google-sub-no-gender",
            email: "no_gender@example.com",
            email_verified: true,
            name: "No Gender Athlete",
          });
          const { userId: noGenderId } = await concept.loginWithGoogleIdToken(
            "token-no-gender",
          ) as { userId: UserID };
          await concept.setRole(noGenderId, Role.Athlete); // Only role set, no gender

          const result = await concept.getAthletesByGender(Gender.Male) as {
            athletes: User[];
          };
          const maleAthletes = result.athletes.filter((a) =>
            a._id === maleAthlete1Id
          );
          assertEquals(maleAthletes.length, 1);
        },
      );

      await st.step(
        "effects: returns the athletes with that gender - for Female",
        async () => {
          const result = await concept.getAthletesByGender(Gender.Female) as {
            athletes: User[];
          };
          assertEquals(result.athletes.length, 2);
          const ids = result.athletes.map((a) => a._id);
          assertExists(ids.find((id) => id === femaleAthlete1Id));
          assertExists(ids.find((id) => id === femaleAthlete2Id));
          assertEquals(ids.includes(maleAthlete1Id), false);
          assertEquals(ids.includes(coachId), false);
        },
      );

      await st.step(
        "effects: returns the athletes with that gender - for Male",
        async () => {
          const result = await concept.getAthletesByGender(Gender.Male) as {
            athletes: User[];
          };
          assertEquals(result.athletes.length, 1);
          const ids = result.athletes.map((a) => a._id);
          assertExists(ids.find((id) => id === maleAthlete1Id));
          assertEquals(ids.includes(femaleAthlete1Id), false);
        },
      );

      await st.step(
        "effects: returns empty array if no athletes match gender",
        async () => {
          // Add a non-athlete user to ensure it's not returned
          mockOauthClient.setMockPayload({
            sub: "google-sub-other",
            email: "other@example.com",
            email_verified: true,
            name: "Other User",
          });
          await concept.loginWithGoogleIdToken("token-other");

          const result = await concept.getAthletesByGender(
            "other-gender" as Gender,
          ) as { athletes: User[] }; // Assuming an invalid gender won't return anything
          assertEquals(result.athletes.length, 0);
        },
      );
    },
  );

  await t.step("Action: getUserRole - `requires` and `effects`", async (st) => {
    let athleteUserId: UserID;
    let coachUserId: UserID;
    let newUserNoRole: UserID;

    await st.step(
      "Setup: Create an athlete, a coach, and a user with no role",
      async () => {
        mockOauthClient.setMockPayload({
          sub: "google-sub-role-athlete",
          email: "role_athlete@example.com",
          email_verified: true,
          name: "Role Athlete",
        });
        const { userId: athleteId } = await concept.loginWithGoogleIdToken(
          "token-role-athlete",
        ) as { userId: UserID };
        athleteUserId = athleteId;
        await concept.setRole(athleteUserId, Role.Athlete);

        mockOauthClient.setMockPayload({
          sub: "google-sub-role-coach",
          email: "role_coach@example.com",
          email_verified: true,
          name: "Role Coach",
        });
        const { userId: coachId } = await concept.loginWithGoogleIdToken(
          "token-role-coach",
        ) as { userId: UserID };
        coachUserId = coachId;
        await concept.setRole(coachUserId, Role.Coach);

        mockOauthClient.setMockPayload({
          sub: "google-sub-role-norole",
          email: "norole@example.com",
          email_verified: true,
          name: "No Role",
        });
        const { userId: noRoleId } = await concept.loginWithGoogleIdToken(
          "token-norole",
        ) as { userId: UserID };
        newUserNoRole = noRoleId;
        // Don't set role for this user
      },
    );

    await st.step(
      "requires: user exists - should return error for non-existent user",
      async () => {
        const nonExistentId: UserID = "non-existent-id-getrole" as UserID;
        const result = await concept.getUserRole(nonExistentId);
        assertExists(result);
        if (
          typeof result === "object" && result !== null && "error" in result
        ) {
          assertObjectMatch(result, {
            error: `user with the id ${nonExistentId} does not exist.`,
          });
        } else {
          throw new Error("Expected an error object for non-existent user");
        }
      },
    );

    await st.step(
      "effects: returns the role of the user - for an athlete",
      async () => {
        const role = await concept.getUserRole(athleteUserId);
        assertEquals(role, Role.Athlete);
      },
    );

    await st.step(
      "effects: returns the role of the user - for a coach",
      async () => {
        const role = await concept.getUserRole(coachUserId);
        assertEquals(role, Role.Coach);
      },
    );

    await st.step(
      "effects: returns null if the user's role has not been set",
      async () => {
        const role = await concept.getUserRole(newUserNoRole);
        assertEquals(role, null);
      },
    );
  });

  await t.step(
    "Principle: Full user registration and data access flow",
    async (st) => {
      let athlete1Id: UserID;
      let coach1Id: UserID;
      let athlete2Id: UserID;

      // # trace: User 1 (Athlete) registration
      await st.step("1. Athlete registration and profile setup", async () => {
        // User logs in with Google
        mockOauthClient.setMockPayload({
          sub: "google-sub-principle-athlete1",
          email: "principle.athlete1@example.com",
          email_verified: true,
          name: "Principle Athlete One",
        });
        const loginResult = await concept.loginWithGoogleIdToken("token-pa1");
        assertExists(loginResult);
        assertNotEquals(
          (loginResult as any).error,
          "Error: " + (loginResult as any).error,
        );
        const { userId, needsName, needsRole } = loginResult as {
          userId: UserID;
          needsName: boolean;
          needsRole: boolean;
        };
        athlete1Id = userId;

        assertEquals(needsName, false, "Name from Google should populate");
        assertEquals(needsRole, true, "New user needs role");

        // User defines role as athlete
        await concept.setRole(athlete1Id, Role.Athlete);
        const roleAfterSet = await concept.getUserRole(athlete1Id);
        assertEquals(
          roleAfterSet,
          Role.Athlete,
          "Role should be set to Athlete",
        );

        // Athlete sets gender and mileage
        await concept.setGender(athlete1Id, Gender.Female);
        await concept.setWeeklyMileage(athlete1Id, 55);

        // Verify athlete's state
        const user = await concept.getUser(athlete1Id) as User;
        assertEquals(user.name, "Principle Athlete One");
        assertEquals(user.role, Role.Athlete);
        assertEquals(user.gender, Gender.Female);
        assertEquals(user.weeklyMileage, 55);
      });

      // # trace: User 2 (Coach) registration
      await st.step("2. Coach registration and profile setup", async () => {
        // User logs in with Google
        mockOauthClient.setMockPayload({
          sub: "google-sub-principle-coach1",
          email: "principle.coach1@example.com",
          email_verified: true,
          name: "Principle Coach One",
        });
        const loginResult = await concept.loginWithGoogleIdToken("token-pc1");
        assertExists(loginResult);
        assertNotEquals(
          (loginResult as any).error,
          "Error: " + (loginResult as any).error,
        );
        const { userId, needsName, needsRole } = loginResult as {
          userId: UserID;
          needsName: boolean;
          needsRole: boolean;
        };
        coach1Id = userId;

        assertEquals(needsName, false, "Name from Google should populate");
        assertEquals(needsRole, true, "New user needs role");

        // User defines role as coach
        await concept.setRole(coach1Id, Role.Coach);

        // Verify coach's state
        const user = await concept.getUser(coach1Id) as User;
        assertEquals(user.name, "Principle Coach One");
        assertEquals(user.role, Role.Coach);
        assertEquals(
          user.gender,
          null,
          "Coach should not have gender by default",
        );
        assertEquals(
          user.weeklyMileage,
          null,
          "Coach should not have weekly mileage",
        );
      });

      // # trace: User 3 (Athlete) registration
      await st.step(
        "3. Second Athlete registration and profile setup",
        async () => {
          mockOauthClient.setMockPayload({
            sub: "google-sub-principle-athlete2",
            email: "principle.athlete2@example.com",
            email_verified: true,
            name: "Principle Athlete Two",
          });
          const loginResult = await concept.loginWithGoogleIdToken("token-pa2");
          assertExists(loginResult);
          const { userId } = loginResult as { userId: UserID };
          athlete2Id = userId;

          await concept.setRole(athlete2Id, Role.Athlete);
          await concept.setGender(athlete2Id, Gender.Male);
          await concept.setWeeklyMileage(athlete2Id, 70);

          const user = await concept.getUser(athlete2Id) as User;
          assertEquals(user.name, "Principle Athlete Two");
          assertEquals(user.role, Role.Athlete);
          assertEquals(user.gender, Gender.Male);
          assertEquals(user.weeklyMileage, 70);
        },
      );

      // # trace: Coach (User 2) gets athlete information
      await st.step("4. Coach retrieves athlete information", async () => {
        // Coach gets athletes by gender
        const femaleAthletesResult = await concept.getAthletesByGender(
          Gender.Female,
        ) as { athletes: User[] };
        assertEquals(femaleAthletesResult.athletes.length, 1);
        assertEquals(femaleAthletesResult.athletes[0]._id, athlete1Id);
        assertEquals(
          femaleAthletesResult.athletes[0].name,
          "Principle Athlete One",
        );
        assertEquals(femaleAthletesResult.athletes[0].gender, Gender.Female);

        const maleAthletesResult = await concept.getAthletesByGender(
          Gender.Male,
        ) as { athletes: User[] };
        assertEquals(maleAthletesResult.athletes.length, 1);
        assertEquals(maleAthletesResult.athletes[0]._id, athlete2Id);
        assertEquals(
          maleAthletesResult.athletes[0].name,
          "Principle Athlete Two",
        );
        assertEquals(maleAthletesResult.athletes[0].gender, Gender.Male);

        // Coach gets an athlete's weekly mileage
        const athlete1Mileage = await concept.getAthleteMileage(athlete1Id) as {
          weeklyMileage: number;
        };
        assertEquals(athlete1Mileage.weeklyMileage, 55);

        const athlete2Mileage = await concept.getAthleteMileage(athlete2Id) as {
          weeklyMileage: number;
        };
        assertEquals(athlete2Mileage.weeklyMileage, 70);
      });
    },
  );

  await client.close();
});
