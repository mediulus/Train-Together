import { Collection, Db } from "mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

const PREFIX = "UserDirectory" + ".";

export type UserID = ID;

export enum Role {
  Coach = "coach",
  Athlete = "athlete",
}

export enum Gender {
  Female = "female",
  Male = "male",
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
    sub: string; // Google stable ID
    email: string; // from Google
    emailVerified: boolean; // from ID token
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
  // Firebase-only verification; no Google OAuth client needed

  constructor(private readonly db: Db, _opts?: unknown) {
    this.users = this.db.collection<User>(PREFIX + "users");

    void this.users.createIndex({ email: 1 }, { unique: true });
    void this.users.createIndex(
      { "google.sub": 1 },
      {
        unique: true,
        partialFilterExpression: { "google.sub": { $exists: true } },
      }
    );

    // No google-auth-library; we only verify Firebase ID tokens via JWKS
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
  async loginWithGoogleIdToken(
    input: string | { idToken?: string }
  ): Promise<
    | { userId: UserID; needsName: boolean; needsRole: boolean }
    | { error: string }
  > {
    const idToken = typeof input === "string" ? input : input?.idToken;
    if (!idToken) {
      console.log("Missing idToken.");
      return { error: "Missing idToken." };
    }

    // Verify Firebase ID token only (no Google OIDC fallback)
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
    if (!firebaseProjectId) {
      console.log("Server missing FIREBASE_PROJECT_ID env var.");
      return { error: "Server missing FIREBASE_PROJECT_ID env var." };
    }
    try {
      const JWKS = createRemoteJWKSet(
        new URL(
          "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
        )
      );
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: `https://securetoken.google.com/${firebaseProjectId}`,
        audience: firebaseProjectId,
      });

      const email = (payload as JWTPayload & { email?: string }).email || "";
      const emailVerified = Boolean(
        (payload as JWTPayload & { email_verified?: boolean }).email_verified
      );
      const name = (payload as JWTPayload & { name?: string }).name;
      const sub = payload.sub as string | undefined;
      if (!sub) {
        console.log("Invalid Firebase token (no sub).");
        return { error: "Invalid Firebase token (no sub)." };
      }
      const profile: GoogleProfile = {
        sub,
        email: this.normalizeEmail(email),
        emailVerified,
        name,
      };
      return this.loginWithGoogle(profile);
    } catch (_e) {
      console.log("Firebase ID token verification failed:");
      return { error: "Invalid Firebase ID token." };
    }
  }

  /**
   * @requires user exists
   * @effects gets the user requested
   *
   * @param userId the id of the user
   * @returns the user queried for
   */
  async getUser({
    userId,
  }: {
    userId: UserID;
  }): Promise<User | { error: string }> {
    const user = await this.users.findOne({ _id: userId });
    if (!user) {
      return { error: "this user does not exists" };
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
  async loginWithGoogle(
    profile: GoogleProfile
  ): Promise<
    | { userId: UserID; needsName: boolean; needsRole: boolean }
    | { error: string }
  > {
    console.log("inside loginWithGoogle");
    if (!profile?.sub) return { error: "Missing Google subject (sub)." };
    if (!profile?.email) return { error: "Missing Google email." };
    if (profile.emailVerified !== true)
      return { error: "Google email must be verified." };

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
        await this.users.updateOne(
          { _id: user._id },
          { $set: { lastLoginAt: now } }
        );
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
  async setName(
    userId: UserID,
    name: string
  ): Promise<Empty | { error: string }> {
    const userName = (name ?? "").trim();
    if (userName.length === 0) return { error: "Name cannot be empty." };

    const res = await this.users.updateOne(
      { _id: userId },
      { $set: { name: userName } } // <-- write to 'name' (not 'userName')
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
  async setRole(
    params: { userId: UserID; role: string } | UserID,
    maybeRole?: string
  ): Promise<Empty | { error: string }> {
    // Support both setRole(userId, role) and setRole({ userId, role })
    const userId =
      typeof params === "string" ? (params as UserID) : params.userId;
    const role =
      typeof params === "string" ? (maybeRole as string) : params.role;

    console.log("Setting role for userId:", userId, "to role:", role);
    if (!userId) return { error: "Missing userId." };
    if (!role) return { error: "Missing role." };

    const existing = await this.users.findOne({ _id: userId as UserID });
    if (!existing) {
      return { error: "User not found." };
    }

    const r = (role || "").toLowerCase();
    if (r !== "athlete" && r !== "coach") {
      return { error: "Invalid role." };
    }
    const res = await this.users.updateOne(
      { _id: userId },
      { $set: { role: r as Role } }
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
  async setGender(
    params: { userId: UserID; gender: Gender | string } | UserID,
    maybeGender?: Gender | string
  ): Promise<Empty | { error: string }> {
    // Support both setGender(userId, gender) and setGender({ userId, gender })
    const userId =
      typeof params === "string" ? (params as UserID) : params.userId;
    const rawGender =
      typeof params === "string"
        ? (maybeGender as string | Gender)
        : params.gender;

    if (!userId) return { error: "Missing userId." };
    if (!rawGender) return { error: "Missing gender." };

    // Normalize gender to enum-compatible value
    const g = (String(rawGender) || "").toLowerCase();
    let genderValue: Gender | null = null;
    if (g === "male") genderValue = Gender.Male;
    if (g === "female") genderValue = Gender.Female;
    if (!genderValue) return { error: "Invalid gender." };

    const existing = await this.users.findOne({ _id: userId as UserID });
    if (!existing) return { error: "User not found." };

    const res = await this.users.updateOne(
      { _id: userId },
      { $set: { gender: genderValue } }
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
  async setWeeklyMileage(
    params:
      | {
          userId?: UserID;
          weeklyMileage?: number | string;
          newMileage?: number | string;
        }
      | UserID,
    maybeMileage?: number | string
  ): Promise<Empty | { error: string }> {
    console.log("inside weekly mileage");
    const userId =
      typeof params === "string"
        ? (params as UserID)
        : (params.userId as UserID);
    const raw =
      typeof params === "string"
        ? maybeMileage
        : params.weeklyMileage ?? params.newMileage;
    if (!userId) return { error: "Missing userId." };
    if (raw === undefined || raw === null)
      return { error: "Missing weeklyMileage." };
    const weeklyMileage = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(weeklyMileage) || weeklyMileage < 0)
      return { error: "Invalid weeklyMileage." };
    const user = await this.users.findOne({ _id: userId });

    if (!user) {
      console.log("User not found for ID:", userId);
      return { error: "User not found." };
    }

    if (user.role !== Role.Athlete) {
      console.log("User role is not athlete:", user.role);
      return { error: "Only athletes can have weekly mileage set." };
    }

    console.log("Found athlete user", {
      _id: user._id,
      currentMileage: user.weeklyMileage,
    });

    try {
      const result = await this.users.updateOne(
        { _id: userId },
        { $set: { weeklyMileage } }
      );

      if (result.acknowledged && result.modifiedCount === 1) {
        return {};
      } else if (result.acknowledged && result.matchedCount === 0) {
        return {};
      } else {
        return {
          error:
            "Failed to update weekly mileage due to an unknown database error.",
        };
      }
    } catch (dbError) {
      console.error("Database error during weekly mileage update:", dbError);
      return {
        error:
          "Failed to update weekly mileage due to a database operation error.",
      };
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
  async getAthleteMileage(
    user_id: UserID
  ): Promise<{ weeklyMileage: number | null } | { error: string }> {
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
   * Gets the role of the user
   *
   * @requires user with userId exists
   * @effects returns the user's role or null if it has not been set yet
   *
   * @param userId a valid userId
   * @returns the role of the user or null if it has not yet been set
   */
  async getUserRole(
    params: UserID | { userId?: UserID }
  ): Promise<Role | null | { error: string }> {
    const userId =
      typeof params === "string"
        ? (params as UserID)
        : (params?.userId as UserID);
    if (!userId) return { error: "Missing userId." };
    const user = await this.users.findOne({ _id: userId as UserID });

    if (!user) {
      return { error: `user with the id ${userId} does not exist.` };
    }

    const role = user.role;
    if (role === undefined || role === null) {
      return null;
    }

    return role;
  }
}
