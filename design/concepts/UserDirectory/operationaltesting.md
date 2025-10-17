
[@testing-concepts](../../background/testing-concepts.md)
# test: UserDirectory - follow the principle when making tests.

First have users login with google, then have users select their roles, then if the user is an athlete have them set their information. And then have then get athletes by gender.

concept UserDirectory
            purpose: Register and manage users of the system with unique emails and roles.
            principle: When a new user logs on they will be prompted to log in with google. Once their account has been created, they will define their role as an athlete or a coach. If they are a coach there account will be created and they will move on, while athletes will be prompted to set certain attributes about themselves like their mileage, and gender. Additionally, if a coach wanted to get information about athletes, they could prompt to find all athletes of a certain gender or get an athletes weekly mileage.
            
            state:
                a set of Users with:
                    a id ID
                    a name String
                    an email String
                    a role Enum{coach, athlete}
                    weeklyMileage: Number | null //athletes have mileage while coaches do not
                    gender: Enum{female, male}
                    google {sub: string, email: string, emailVerified: Boolean, name:string} | null
                    primaryAuth: string
                    lastLoginAt: Date

                
            actions:
                loginWithGoogleIdToken(idToken: string): userID: ID, needsName: boolean, needsRole: boolean
                    requires: valid google idToken 
                    effects: generates a new/returning user and asserts whether or not they need a role or name
                
                getUser(userId: ID): user: User
                    requires: User exists
                    effects: returns thte user
                setName(userId: ID, name: String)
                    requires: user exists with that userID
                    effects: user.name = name

                setRole(userId: ID, role: Enum{'athlete', 'coach;})
                    requires: user exists with that userID
                    effects: user.role = role

                setGender(userId: ID, gender: Enum{'male'|'female'})
                    requires: user exists with that userID
                    effects: user.gender = gender

                setWeeklyMileage(user_id: ID, weeklyMileage: Number)
                    requires: User exists with that user_id and has role = athlete
                    effects: user.weeklyMileage = weeklyMileage

                getWeeklyMileage(user_id): (weeklyMileage: Number)
                  requires: User exists and user.role == Athlete
                  effects: returns the users weeklyMileage

                getAthletesByGender(gender: Enum): User[]
                  requires: there are athletes and athletes with that gender
                  effects: returns the athletes with that gender

                getUserRole(userId: ID): Enum {'athlete', 'coach'}
                    requires: users exists with that userId
                    effects: returns the role of the user


import { Collection, Db } from "npm:mongodb";
import { Empty, ID} from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { OAuth2Client } from "google-auth-library";

const PREFIX = "UserDirectory" + ".";

export type UserID = ID;

export enum Role {
    Coach = "coach",
    Athlete = "athlete",
}

export enum Gender {
  Female = "female",
  Male = "male"
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
};

export interface User {
  _id: UserID;
  email: string;        
  name?: string | null;        
  role?: Role | null;         
  weeklyMileage?: number | null;
  gender?: Gender | null;

  google?: {
    sub: string;                       // Google stable ID
    email: string;                     // from Google
    emailVerified: boolean;            // from ID token
    name?: string;
  } | null;

  primaryAuth?: "google";
  lastLoginAt?: Date;
}

/**
 * @concept UserDirectory
 * @purpose Register and manage users of the system with unique emails and roles.
 * @principle After a user registers with a role, they can be referenced by other concepts.
 */
export default class UserDirectoryConcept {
    users: Collection<User>;
    private oauth?: OAuth2Client;
    private googleClientId?: string;
    
    constructor(private readonly db: Db, opts?: { oauthClient?: OAuth2Client; googleClientId?: string }) {
      this.users = this.db.collection<User>(PREFIX + "users");

      void this.users.createIndex({ email: 1 }, { unique: true });
      void this.users.createIndex(
        { "google.sub": 1 },
        { unique: true, partialFilterExpression: { "google.sub": { $exists: true } } },
      );

      // Google verification wiring
      this.oauth = opts?.oauthClient ?? (opts?.googleClientId ? new OAuth2Client(opts.googleClientId) : undefined);
      this.googleClientId = opts?.googleClientId;
    }

    /**
     * Normalizes emails to lowercase + remove white space to prevent duplicates
     * @param email (string) valid google email
     * @returns the normalized email
     * 
     * ex. Alex@Gmail.com -> alex@gmail.com
     */
    private normalizeEmail(email: string): string {
      return (email || "").trim().toLowerCase();
    }

    /**
     * Verifies the Google ID token inside the concept
     * 
     * @requires valid google idToken 
     * @effects generates a new/returning user and asserts whether or not they need a role or name
     * 
     * @param idToken (string) google idToken
     * @returns 
     *    @userID the new/returning user's id association in the mongo db
     *    @needsName boolean value of whether the user requires a name to be set
     *    @neesRole boolean value of whether the user requires a role to be set
    */
    async loginWithGoogleIdToken(idToken: string,): Promise<{ userId: UserID; needsName: boolean; needsRole: boolean } | { error: string }> {
      if (!idToken) return { error: "Missing idToken." };
      if (!this.oauth || !this.googleClientId) {
        return { error: "Google verification is not configured (oauth clientId missing)." };
      }

      // 1) Verify ID token with Google
      const ticket = await this.oauth.verifyIdToken({
        idToken,
        audience: this.googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload) return { error: "Invalid Google token." };

      // 2) Build the profile expected by the concept
      const profile: GoogleProfile = {
        sub: payload.sub!,
        email: this.normalizeEmail(payload.email || ""),
        emailVerified: Boolean(payload.email_verified),
        name: payload.name,
      };

      // 3) Delegate to the existing upsert flow
      return this.loginWithGoogle(profile);
    }

    /**
     * @requires user exists
     * @effects gets the user requested
     * 
     * @param userId the id of the user
     * @returns the user queried for
     */
    async getUser(userId: UserID): Promise<User | {error: string}> {
      const user = await this.users.findOne({ _id: userId as UserID });
      if (!user) {
        return {error: 'this user does not exists'}
      }
      return user;
    }
    /**
     * Helper function called withing loginWithGoogleIdToken to generate the users profile
     * 
     * @param profile (GoogleProfile) users google profile
     * @returns 
     *    @userID the new/returning user's id association in the mongo db
     *    @needsName boolean value of whether the user requires a name to be set
     *    @neesRole boolean value of whether the user requires a role to be set
     */
    async loginWithGoogle(profile: GoogleProfile): Promise<{ userId: UserID; needsName: boolean; needsRole: boolean } | { error: string }> {
      if (!profile?.sub) return { error: "Missing Google subject (sub)." };
      if (!profile?.email) return { error: "Missing Google email." };
      if (profile.emailVerified !== true) return { error: "Google email must be verified." };

      const now = new Date();
      const normalizedEmail = this.normalizeEmail(profile.email);

      // 1) Try by google.sub 
      let user = await this.users.findOne({ "google.sub": profile.sub });

      if (!user) {
        // 2) Try by email (in case user existed from import/manual creation)
        user = await this.users.findOne({ email: normalizedEmail });
        if (user) {
          // Attach/link Google identity to existing user
          const update = {
            $set: {
              email: normalizedEmail,
              google: {
                sub: profile.sub,
                email: normalizedEmail,
                emailVerified: true,
                ...(profile.name ? { name: profile.name } : {}),
                ...(profile.picture ? { picture: profile.picture } : {}),
              },
              primaryAuth: "google" as const,
              lastLoginAt: now,
            },
          };

          await this.users.updateOne({ _id: user._id }, update);
          user = { ...user, ...update.$set } as User;
        } else {
          // 3) Create new user document
          const newUser: User = {
            _id: freshID() as UserID,
            email: normalizedEmail,
            name: profile.name ?? null,
            role: null,
            weeklyMileage: null,
            gender: null,
            google: {
              sub: profile.sub,
              email: normalizedEmail,
              emailVerified: true,
              ...(profile.name ? { name: profile.name } : {}),
              ...(profile.picture ? { picture: profile.picture } : {}),
            },
            primaryAuth: "google",
            lastLoginAt: now,
          };

          await this.users.insertOne(newUser);
          user = newUser;
        }
      } else {
        // Keep google.sub link; update email if it changed; bump lastLoginAt
        const setDoc: Partial<User> = { lastLoginAt: now };
        if (user.email !== normalizedEmail) setDoc.email = normalizedEmail;

        if (setDoc.email || !user.lastLoginAt) {
          await this.users.updateOne({ _id: user._id }, { $set: setDoc });
          user = { ...user, ...setDoc };
        } else {
          // still bump lastLoginAt even if email unchanged
          await this.users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });
          user.lastLoginAt = now;
        }
      }

      const needsName = !(user.name && user.name.trim().length > 0);
      const needsRole = !user.role;

      return { userId: user._id, needsName, needsRole };
    }

  
    /**
     * Sets the users name to the new name
     * 
     * @requires user exists with that userID
     * @effects user.name = name
     * 
     * @param userId (userID) a userID associated with a current user
     * @param name (string) the new name the user wants
    */
    async setName(userId: UserID, name: string): Promise<Empty | { error: string }> {
      const userName = (name ?? "").trim();
      if (userName.length === 0) return { error: "Name cannot be empty." };

      const res = await this.users.updateOne(
        { _id: userId },
        { $set: { name: userName } }, // <-- write to 'name' (not 'userName')
      );

      if (res.matchedCount === 0) return { error: "User not found." };
      return {};
    }

    /**
     * makes the user either an athlete or a coach
     * 
     * @requires user exists with that userID
     * @effects user.role = role
     * 
     * @param userId (UserID) a userID associated with a current user
     * @param role (Role) {athlete | coach} 
     */
    async setRole(userId: UserID, role: Role ): Promise<Empty | { error: string }> {
      if (role !== "athlete" && role !== "coach") {
        return { error: "Invalid role." };
      }

      const res = await this.users.updateOne(
        { _id: userId },
        { $set: { role } },
      );

      if (res.matchedCount === 0) return { error: "User not found." };
      return {};
    }

    /**
     * makes the user either an male or female
     * 
     * @requires user exists with that userID
     * @effects user.gender = gender
     * 
     * @param userId (UserID) a userID associated with a current user
     * @param gender (Role) {male | female} 
     */
    async setGender(userId: UserID, gender: Gender): Promise<Empty | {error: string}> {
      const res = await this.users.updateOne(
        { _id: userId },
        { $set: { gender } },
      );

      if (res.matchedCount === 0) return { error: "User not found." };
      return {};
    }
    
    /**
     * sets the weeklyMileage of an ATHLETE 
     * 
     * @requires User exists with that user_id 
     * @requires user.role = athlete
     * @effects user.weeklyMileage = weeklyMileage
     * 
     * @param userId (UserID) a userID associated with a current user that is an athlete
     * @param weeklyMileage (number) The weekly mileage to set for the user.
     * 
     */
    async setWeeklyMileage(user_id: UserID, weeklyMileage: number ): Promise<Empty | { error: string }> {
      const user = await this.users.findOne({ _id: user_id as UserID });

      if (!user) {
        return { error: "User not found." };
      }

      if (user.role !== Role.Athlete) {
        return { error: "Only athletes can have weekly mileage set." };
      }

      try {
        const result = await this.users.updateOne({_id:user_id}, { $set: { weeklyMileage } });

        if (result.acknowledged && result.modifiedCount === 1) {
          return {};
        
        } else if (result.acknowledged && result.matchedCount === 0) {
          return {};

        } else {
          return { error: "Failed to update weekly mileage due to an unknown database error." };
        }

      } catch (dbError) {
          console.error("Database error during weekly mileage update:", dbError);
          return { error: "Failed to update weekly mileage due to a database operation error." };
      }
    }

  /**
   * Gets the weekly mileage of the athlete
   * 
   * @requires User exists with that user_id 
   * @requires user.role = athlete
   * @effects returns the users weeklyMileage
   * 
   * @param userId (UserID) a userID associated with a current user that is an athlete
   * @returns the weekly mileage of the associated user
   */
  async getAthleteMileage(user_id: UserID): Promise<{ weeklyMileage: number | null } | { error: string }> {
    const user = await this.users.findOne({ _id: user_id as UserID });
    
    if (!user) {
      return { error: "User not found." };
    } 

    if (user.role !== Role.Athlete) {
      return { error: "Only athletes have weekly mileage." };
    } 
    
    return { weeklyMileage: user.weeklyMileage ?? null };
  }

  /**
   * Gets all of the athletes with that associated gender
   * 
   * @requires there are athletes and athletes with that gender
   * @effects returns the athletes with that gender
   *
   * @paran gender (Gender) {'male' | 'female'} of the athletes you want to get
   * @returns a list of users that have that associated gender
   */
  async getAthletesByGender(gender: Gender): Promise<{ athletes: User[] } | { error: string }> {
    try {
      const athletes = await this.users.find({ role : Role.Athlete, gender: gender }).toArray();
      return { athletes };

    } catch (dbError) {
      console.error("Database error during fetching athletes by gender:", dbError);
      return { error: "Failed to fetch athletes due to a database operation error." };
    }
  }

  /**
   * Gets the role of the user
   * 
   * @requires user with userId exists
   * @effects returns the user's role or null if it has not been set yet
   * 
   * @param userId a valid userId
   * @returns the role of the user or null if it has not yet been set
   */
  async getUserRole(userId: UserID): Promise<Role | null | {error: string}> {
    const user = await this.users.findOne({ _id: userId as UserID });

    if (!user) {
      return {error: `user with the id ${userId} does not exist.`}
    }

    const role = user.role;
    if (role === undefined) {
      return null;
    } 

    return role;
  }
   
}




# response:

```typescript
// # file: src/UserDirectory/UserDirectoryConcept.test.ts

import { assertEquals, assertExists, assertInstanceOf, assertNotEquals, assertObjectMatch } from "jsr:@std/assert";
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

  async verifyIdToken(options: { idToken: string; audience: string | string[] }): Promise<any> {
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
  const usersCollection: Collection<User> = db.collection("UserDirectory.users");

  await t.step("Action: loginWithGoogleIdToken - `requires` and `effects`", async (st) => {
    await st.step("requires: valid google idToken - should return error for missing idToken", async () => {
      const result = await concept.loginWithGoogleIdToken("");
      assertObjectMatch(result, { error: "Missing idToken." });
    });

    await st.step("requires: valid google idToken - should return error for invalid token", async () => {
      mockOauthClient.setMockPayload(null); // Simulate invalid token
      const result = await concept.loginWithGoogleIdToken("invalid-token");
      assertObjectMatch(result, { error: "Invalid Google token." });
    });

    await st.step("requires: valid google idToken - should return error if email not verified", async () => {
      mockOauthClient.setMockPayload({
        sub: "google-sub-unverified",
        email: "unverified@example.com",
        email_verified: false,
        name: "Unverified User",
      });
      const result = await concept.loginWithGoogleIdToken("valid-but-unverified-token");
      assertObjectMatch(result, { error: "Google email must be verified." });
    });

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
      assertNotEquals((result as any).error, "Expected success, got error: " + (result as any).error);
      const { userId, needsName, needsRole } = result as { userId: UserID; needsName: boolean; needsRole: boolean };

      assertExists(userId);
      assertEquals(needsName, false, "Name should be pre-filled from Google profile");
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

    await st.step("effects: handles returning user (updates lastLoginAt, doesn't need name/role if already set)", async () => {
      const email = "returninguser@example.com";
      const name = "Returning User";
      mockOauthClient.setMockPayload({
        sub: "google-sub-2",
        email: email,
        email_verified: true,
        name: name,
      });

      // First login (new user)
      const firstLoginResult = await concept.loginWithGoogleIdToken("valid-token-2-first");
      const { userId: firstUserId } = firstLoginResult as { userId: UserID };
      await concept.setName(firstUserId, name);
      await concept.setRole(firstUserId, Role.Athlete);
      await concept.setGender(firstUserId, Gender.Female);
      await concept.setWeeklyMileage(firstUserId, 50);

      const userBeforeSecondLogin = await usersCollection.findOne({ _id: firstUserId });
      const lastLoginAtBefore = userBeforeSecondLogin?.lastLoginAt;

      // Simulate a time delay for second login
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second login (returning user)
      const secondLoginResult = await concept.loginWithGoogleIdToken("valid-token-2-second");
      assertExists(secondLoginResult);
      assertNotEquals((secondLoginResult as any).error, "Expected success, got error: " + (secondLoginResult as any).error);

      const { userId, needsName, needsRole } = secondLoginResult as { userId: UserID; needsName: boolean; needsRole: boolean };

      assertEquals(userId, firstUserId, "Returning user ID should be the same");
      assertEquals(needsName, false, "Returning user should not need name if already set");
      assertEquals(needsRole, false, "Returning user should not need role if already set");

      const userAfterSecondLogin = await usersCollection.findOne({ _id: userId });
      assertExists(userAfterSecondLogin);
      assertEquals(userAfterSecondLogin.email, email);
      assertEquals(userAfterSecondLogin.name, name);
      assertEquals(userAfterSecondLogin.role, Role.Athlete);
      assertNotEquals(userAfterSecondLogin.lastLoginAt, lastLoginAtBefore, "lastLoginAt should be updated");
    });
  });

  await t.step("Action: getUser - `requires` and `effects`", async (st) => {
    let testUserId: UserID;
    await st.step("Setup: Create a user", async () => {
      mockOauthClient.setMockPayload({
        sub: "google-sub-getuser",
        email: "getuser@example.com",
        email_verified: true,
        name: "Get User Test",
      });
      const { userId } = await concept.loginWithGoogleIdToken("token-getuser") as { userId: UserID };
      testUserId = userId;
    });

    await st.step("requires: User exists - should return error for non-existent user", async () => {
      const nonExistentId: UserID = "non-existent-id" as UserID;
      const result = await concept.getUser(nonExistentId);
      assertObjectMatch(result, { error: "this user does not exists" });
    });

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
      const { userId } = await concept.loginWithGoogleIdToken("token-setname") as { userId: UserID };
      testUserId = userId;
      const user = await concept.getUser(testUserId) as User;
      assertEquals(user.name, null);
    });

    await st.step("requires: user exists - should return error for non-existent user", async () => {
      const nonExistentId: UserID = "non-existent-id-setname" as UserID;
      const result = await concept.setName(nonExistentId, "Invalid Name");
      assertObjectMatch(result, { error: "User not found." });
    });

    await st.step("requires: name is not empty - should return error for empty name", async () => {
      const result = await concept.setName(testUserId, "");
      assertObjectMatch(result, { error: "Name cannot be empty." });
    });

    await st.step("effects: user.name = name - sets the user's name", async () => {
      const newName = "Alice Wonderland";
      const result = await concept.setName(testUserId, newName);
      assertObjectMatch(result, {}); // Empty object means success
      const user = await usersCollection.findOne({ _id: testUserId });
      assertExists(user);
      assertEquals(user.name, newName);
    });
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
      const { userId } = await concept.loginWithGoogleIdToken("token-setrole") as { userId: UserID };
      testUserId = userId;
    });

    await st.step("requires: user exists - should return error for non-existent user", async () => {
      const nonExistentId: UserID = "non-existent-id-setrole" as UserID;
      const result = await concept.setRole(nonExistentId, Role.Athlete);
      assertObjectMatch(result, { error: "User not found." });
    });

    await st.step("requires: role is valid - should return error for invalid role", async () => {
      const result = await concept.setRole(testUserId, "invalid-role" as Role);
      assertObjectMatch(result, { error: "Invalid role." });
    });

    await st.step("effects: user.role = role - sets the user's role to athlete", async () => {
      const result = await concept.setRole(testUserId, Role.Athlete);
      assertObjectMatch(result, {});
      const user = await usersCollection.findOne({ _id: testUserId });
      assertExists(user);
      assertEquals(user.role, Role.Athlete);
    });

    await st.step("effects: user.role = role - changes the user's role to coach", async () => {
      const result = await concept.setRole(testUserId, Role.Coach);
      assertObjectMatch(result, {});
      const user = await usersCollection.findOne({ _id: testUserId });
      assertExists(user);
      assertEquals(user.role, Role.Coach);
    });
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
      const { userId } = await concept.loginWithGoogleIdToken("token-setgender") as { userId: UserID };
      testUserId = userId;
    });

    await st.step("requires: user exists - should return error for non-existent user", async () => {
      const nonExistentId: UserID = "non-existent-id-setgender" as UserID;
      const result = await concept.setGender(nonExistentId, Gender.Female);
      assertObjectMatch(result, { error: "User not found." });
    });

    await st.step("effects: user.gender = gender - sets the user's gender to female", async () => {
      const result = await concept.setGender(testUserId, Gender.Female);
      assertObjectMatch(result, {});
      const user = await usersCollection.findOne({ _id: testUserId });
      assertExists(user);
      assertEquals(user.gender, Gender.Female);
    });

    await st.step("effects: user.gender = gender - changes the user's gender to male", async () => {
      const result = await concept.setGender(testUserId, Gender.Male);
      assertObjectMatch(result, {});
      const user = await usersCollection.findOne({ _id: testUserId });
      assertExists(user);
      assertEquals(user.gender, Gender.Male);
    });
  });

  await t.step("Action: setWeeklyMileage - `requires` and `effects`", async (st) => {
    let athleteUserId: UserID;
    let coachUserId: UserID;

    await st.step("Setup: Create an athlete and a coach", async () => {
      mockOauthClient.setMockPayload({ sub: "google-sub-athlete", email: "athlete@example.com", email_verified: true, name: "Athletes Miles" });
      const { userId: athleteId } = await concept.loginWithGoogleIdToken("token-athlete") as { userId: UserID };
      athleteUserId = athleteId;
      await concept.setRole(athleteUserId, Role.Athlete);

      mockOauthClient.setMockPayload({ sub: "google-sub-coach", email: "coach@example.com", email_verified: true, name: "Coaches Miles" });
      const { userId: coachId } = await concept.loginWithGoogleIdToken("token-coach") as { userId: UserID };
      coachUserId = coachId;
      await concept.setRole(coachUserId, Role.Coach);
    });

    await st.step("requires: User exists - should return error for non-existent user", async () => {
      const nonExistentId: UserID = "non-existent-id-setmileage" as UserID;
      const result = await concept.setWeeklyMileage(nonExistentId, 100);
      assertObjectMatch(result, { error: "User not found." });
    });

    await st.step("requires: user.role = athlete - should return error for a coach user", async () => {
      const result = await concept.setWeeklyMileage(coachUserId, 75);
      assertObjectMatch(result, { error: "Only athletes can have weekly mileage set." });
    });

    await st.step("effects: user.weeklyMileage = weeklyMileage - sets an athlete's mileage", async () => {
      const mileage = 65;
      const result = await concept.setWeeklyMileage(athleteUserId, mileage);
      assertObjectMatch(result, {});
      const user = await usersCollection.findOne({ _id: athleteUserId });
      assertExists(user);
      assertEquals(user.weeklyMileage, mileage);
    });

    await st.step("effects: user.weeklyMileage = weeklyMileage - updates an athlete's mileage", async () => {
      const newMileage = 70;
      const result = await concept.setWeeklyMileage(athleteUserId, newMileage);
      assertObjectMatch(result, {});
      const user = await usersCollection.findOne({ _id: athleteUserId });
      assertExists(user);
      assertEquals(user.weeklyMileage, newMileage);
    });
  });

  await t.step("Action: getAthleteMileage - `requires` and `effects`", async (st) => {
    let athleteUserId: UserID;
    let coachUserId: UserID;

    await st.step("Setup: Create an athlete and a coach", async () => {
      mockOauthClient.setMockPayload({ sub: "google-sub-getmileage-athlete", email: "getmileage_athlete@example.com", email_verified: true, name: "Get Mileage Athlete" });
      const { userId: athleteId } = await concept.loginWithGoogleIdToken("token-getmileage-athlete") as { userId: UserID };
      athleteUserId = athleteId;
      await concept.setRole(athleteUserId, Role.Athlete);
      await concept.setWeeklyMileage(athleteUserId, 42);

      mockOauthClient.setMockPayload({ sub: "google-sub-getmileage-coach", email: "getmileage_coach@example.com", email_verified: true, name: "Get Mileage Coach" });
      const { userId: coachId } = await concept.loginWithGoogleIdToken("token-getmileage-coach") as { userId: UserID };
      coachUserId = coachId;
      await concept.setRole(coachUserId, Role.Coach);
    });

    await st.step("requires: User exists - should return error for non-existent user", async () => {
      const nonExistentId: UserID = "non-existent-id-getmileage" as UserID;
      const result = await concept.getAthleteMileage(nonExistentId);
      assertObjectMatch(result, { error: "User not found." });
    });

    await st.step("requires: user.role = athlete - should return error for a coach user", async () => {
      const result = await concept.getAthleteMileage(coachUserId);
      assertObjectMatch(result, { error: "Only athletes have weekly mileage." });
    });

    await st.step("effects: returns the users weeklyMileage - for an athlete with mileage", async () => {
      const result = await concept.getAthleteMileage(athleteUserId) as { weeklyMileage: number };
      assertObjectMatch(result, { weeklyMileage: 42 });
    });

    await st.step("effects: returns the users weeklyMileage - for an athlete without mileage (should be null)", async () => {
      mockOauthClient.setMockPayload({ sub: "google-sub-athlete-no-mileage", email: "athlete_nomileage@example.com", email_verified: true, name: "No Mileage" });
      const { userId: noMileageAthleteId } = await concept.loginWithGoogleIdToken("token-no-mileage") as { userId: UserID };
      await concept.setRole(noMileageAthleteId, Role.Athlete);
      // Don't set mileage

      const result = await concept.getAthleteMileage(noMileageAthleteId) as { weeklyMileage: number | null };
      assertObjectMatch(result, { weeklyMileage: null });
    });
  });

  await t.step("Action: getAthletesByGender - `requires` and `effects`", async (st) => {
    let femaleAthlete1Id: UserID, femaleAthlete2Id: UserID, maleAthlete1Id: UserID, coachId: UserID;

    await st.step("Setup: Create multiple users with different roles/genders", async () => {
      // Female Athlete 1
      mockOauthClient.setMockPayload({ sub: "google-sub-fa1", email: "fa1@example.com", email_verified: true, name: "Female Athlete 1" });
      const { userId: fa1 } = await concept.loginWithGoogleIdToken("token-fa1") as { userId: UserID };
      femaleAthlete1Id = fa1;
      await concept.setRole(femaleAthlete1Id, Role.Athlete);
      await concept.setGender(femaleAthlete1Id, Gender.Female);
      await concept.setWeeklyMileage(femaleAthlete1Id, 30);

      // Female Athlete 2
      mockOauthClient.setMockPayload({ sub: "google-sub-fa2", email: "fa2@example.com", email_verified: true, name: "Female Athlete 2" });
      const { userId: fa2 } = await concept.loginWithGoogleIdToken("token-fa2") as { userId: UserID };
      femaleAthlete2Id = fa2;
      await concept.setRole(femaleAthlete2Id, Role.Athlete);
      await concept.setGender(femaleAthlete2Id, Gender.Female);
      await concept.setWeeklyMileage(femaleAthlete2Id, 45);

      // Male Athlete 1
      mockOauthClient.setMockPayload({ sub: "google-sub-ma1", email: "ma1@example.com", email_verified: true, name: "Male Athlete 1" });
      const { userId: ma1 } = await concept.loginWithGoogleIdToken("token-ma1") as { userId: UserID };
      maleAthlete1Id = ma1;
      await concept.setRole(maleAthlete1Id, Role.Athlete);
      await concept.setGender(maleAthlete1Id, Gender.Male);
      await concept.setWeeklyMileage(maleAthlete1Id, 60);

      // Coach
      mockOauthClient.setMockPayload({ sub: "google-sub-gc", email: "coach_gender@example.com", email_verified: true, name: "Gender Coach" });
      const { userId: cId } = await concept.loginWithGoogleIdToken("token-gc") as { userId: UserID };
      coachId = cId;
      await concept.setRole(coachId, Role.Coach);
    });

    await st.step("requires: there are athletes and athletes with that gender - should return empty array if no athletes of that gender", async () => {
      // Create an athlete without gender
      mockOauthClient.setMockPayload({ sub: "google-sub-no-gender", email: "no_gender@example.com", email_verified: true, name: "No Gender Athlete" });
      const { userId: noGenderId } = await concept.loginWithGoogleIdToken("token-no-gender") as { userId: UserID };
      await concept.setRole(noGenderId, Role.Athlete); // Only role set, no gender

      const result = await concept.getAthletesByGender(Gender.Male) as { athletes: User[] };
      const maleAthletes = result.athletes.filter(a => a._id === maleAthlete1Id);
      assertEquals(maleAthletes.length, 1);
    });

    await st.step("effects: returns the athletes with that gender - for Female", async () => {
      const result = await concept.getAthletesByGender(Gender.Female) as { athletes: User[] };
      assertEquals(result.athletes.length, 2);
      const ids = result.athletes.map(a => a._id);
      assertExists(ids.find(id => id === femaleAthlete1Id));
      assertExists(ids.find(id => id === femaleAthlete2Id));
      assertEquals(ids.includes(maleAthlete1Id), false);
      assertEquals(ids.includes(coachId), false);
    });

    await st.step("effects: returns the athletes with that gender - for Male", async () => {
      const result = await concept.getAthletesByGender(Gender.Male) as { athletes: User[] };
      assertEquals(result.athletes.length, 1);
      const ids = result.athletes.map(a => a._id);
      assertExists(ids.find(id => id === maleAthlete1Id));
      assertEquals(ids.includes(femaleAthlete1Id), false);
    });

    await st.step("effects: returns empty array if no athletes match gender", async () => {
      // Add a non-athlete user to ensure it's not returned
      mockOauthClient.setMockPayload({ sub: "google-sub-other", email: "other@example.com", email_verified: true, name: "Other User" });
      await concept.loginWithGoogleIdToken("token-other");

      const result = await concept.getAthletesByGender("other-gender" as Gender) as { athletes: User[] }; // Assuming an invalid gender won't return anything
      assertEquals(result.athletes.length, 0);
    });
  });

  await t.step("Action: getUserRole - `requires` and `effects`", async (st) => {
    let athleteUserId: UserID;
    let coachUserId: UserID;
    let newUserNoRole: UserID;

    await st.step("Setup: Create an athlete, a coach, and a user with no role", async () => {
      mockOauthClient.setMockPayload({ sub: "google-sub-role-athlete", email: "role_athlete@example.com", email_verified: true, name: "Role Athlete" });
      const { userId: athleteId } = await concept.loginWithGoogleIdToken("token-role-athlete") as { userId: UserID };
      athleteUserId = athleteId;
      await concept.setRole(athleteUserId, Role.Athlete);

      mockOauthClient.setMockPayload({ sub: "google-sub-role-coach", email: "role_coach@example.com", email_verified: true, name: "Role Coach" });
      const { userId: coachId } = await concept.loginWithGoogleIdToken("token-role-coach") as { userId: UserID };
      coachUserId = coachId;
      await concept.setRole(coachUserId, Role.Coach);

      mockOauthClient.setMockPayload({ sub: "google-sub-role-norole", email: "norole@example.com", email_verified: true, name: "No Role" });
      const { userId: noRoleId } = await concept.loginWithGoogleIdToken("token-norole") as { userId: UserID };
      newUserNoRole = noRoleId;
      // Don't set role for this user
    });

    await st.step("requires: user exists - should return error for non-existent user", async () => {
      const nonExistentId: UserID = "non-existent-id-getrole" as UserID;
      const result = await concept.getUserRole(nonExistentId);
      assertObjectMatch(result, { error: `user with the id ${nonExistentId} does not exist.` });
    });

    await st.step("effects: returns the role of the user - for an athlete", async () => {
      const role = await concept.getUserRole(athleteUserId);
      assertEquals(role, Role.Athlete);
    });

    await st.step("effects: returns the role of the user - for a coach", async () => {
      const role = await concept.getUserRole(coachUserId);
      assertEquals(role, Role.Coach);
    });

    await st.step("effects: returns null if the user's role has not been set", async () => {
      const role = await concept.getUserRole(newUserNoRole);
      assertEquals(role, null);
    });
  });

  await t.step("Principle: Full user registration and data access flow", async (st) => {
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
      assertNotEquals((loginResult as any).error, "Error: " + (loginResult as any).error);
      const { userId, needsName, needsRole } = loginResult as { userId: UserID; needsName: boolean; needsRole: boolean };
      athlete1Id = userId;

      assertEquals(needsName, false, "Name from Google should populate");
      assertEquals(needsRole, true, "New user needs role");

      // User defines role as athlete
      await concept.setRole(athlete1Id, Role.Athlete);
      const roleAfterSet = await concept.getUserRole(athlete1Id);
      assertEquals(roleAfterSet, Role.Athlete, "Role should be set to Athlete");

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
      assertNotEquals((loginResult as any).error, "Error: " + (loginResult as any).error);
      const { userId, needsName, needsRole } = loginResult as { userId: UserID; needsName: boolean; needsRole: boolean };
      coach1Id = userId;

      assertEquals(needsName, false, "Name from Google should populate");
      assertEquals(needsRole, true, "New user needs role");

      // User defines role as coach
      await concept.setRole(coach1Id, Role.Coach);

      // Verify coach's state
      const user = await concept.getUser(coach1Id) as User;
      assertEquals(user.name, "Principle Coach One");
      assertEquals(user.role, Role.Coach);
      assertEquals(user.gender, null, "Coach should not have gender by default");
      assertEquals(user.weeklyMileage, null, "Coach should not have weekly mileage");
    });

    // # trace: User 3 (Athlete) registration
    await st.step("3. Second Athlete registration and profile setup", async () => {
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
    });

    // # trace: Coach (User 2) gets athlete information
    await st.step("4. Coach retrieves athlete information", async () => {
      // Coach gets athletes by gender
      const femaleAthletesResult = await concept.getAthletesByGender(Gender.Female) as { athletes: User[] };
      assertEquals(femaleAthletesResult.athletes.length, 1);
      assertEquals(femaleAthletesResult.athletes[0]._id, athlete1Id);
      assertEquals(femaleAthletesResult.athletes[0].name, "Principle Athlete One");
      assertEquals(femaleAthletesResult.athletes[0].gender, Gender.Female);

      const maleAthletesResult = await concept.getAthletesByGender(Gender.Male) as { athletes: User[] };
      assertEquals(maleAthletesResult.athletes.length, 1);
      assertEquals(maleAthletesResult.athletes[0]._id, athlete2Id);
      assertEquals(maleAthletesResult.athletes[0].name, "Principle Athlete Two");
      assertEquals(maleAthletesResult.athletes[0].gender, Gender.Male);

      // Coach gets an athlete's weekly mileage
      const athlete1Mileage = await concept.getAthleteMileage(athlete1Id) as { weeklyMileage: number };
      assertEquals(athlete1Mileage.weeklyMileage, 55);

      const athlete2Mileage = await concept.getAthleteMileage(athlete2Id) as { weeklyMileage: number };
      assertEquals(athlete2Mileage.weeklyMileage, 70);
    });
  });

  await client.close();
});
```