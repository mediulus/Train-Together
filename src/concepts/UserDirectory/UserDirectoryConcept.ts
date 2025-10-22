import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
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
  private oauth?: OAuth2Client;
  private googleClientId?: string;

  constructor(
    private readonly db: Db,
    opts?: { oauthClient?: OAuth2Client; googleClientId?: string }
  ) {
    this.users = this.db.collection<User>(PREFIX + "users");

    void this.users.createIndex({ email: 1 }, { unique: true });
    void this.users.createIndex(
      { "google.sub": 1 },
      {
        unique: true,
        partialFilterExpression: { "google.sub": { $exists: true } },
      }
    );

    // Google verification wiring
    this.oauth =
      opts?.oauthClient ??
      (opts?.googleClientId
        ? new OAuth2Client(opts.googleClientId)
        : undefined);
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
  async loginWithGoogleIdToken(
    input: string | { idToken?: string }
  ): Promise<
    | { userId: UserID; needsName: boolean; needsRole: boolean }
    | { error: string }
  > {
    const idToken = typeof input === "string" ? input : input?.idToken;
    if (!idToken) return { error: "Missing idToken." };
    if (!this.oauth || !this.googleClientId) {
      return {
        error:
          "Google verification is not configured (oauth clientId missing).",
      };
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
  async getUser(userId: UserID): Promise<User | { error: string }> {
    const user = await this.users.findOne({ _id: userId as UserID });
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
    userId: UserID,
    role: Role
  ): Promise<Empty | { error: string }> {
    if (role !== "athlete" && role !== "coach") {
      return { error: "Invalid role." };
    }

    const res = await this.users.updateOne({ _id: userId }, { $set: { role } });

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
    userId: UserID,
    gender: Gender
  ): Promise<Empty | { error: string }> {
    const res = await this.users.updateOne(
      { _id: userId },
      { $set: { gender } }
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
    user_id: UserID,
    weeklyMileage: number
  ): Promise<Empty | { error: string }> {
    const user = await this.users.findOne({ _id: user_id as UserID });

    if (!user) {
      return { error: "User not found." };
    }

    if (user.role !== Role.Athlete) {
      return { error: "Only athletes can have weekly mileage set." };
    }

    try {
      const result = await this.users.updateOne(
        { _id: user_id },
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
   * Gets all of the athletes with that associated gender
   *
   * @requires there are athletes and athletes with that gender
   * @effects returns the athletes with that gender
   *
   * @paran gender (Gender) {'male' | 'female'} of the athletes you want to get
   * @returns a list of users that have that associated gender
   */
  async getAthletesByGender(
    gender: Gender
  ): Promise<{ athletes: User[] } | { error: string }> {
    try {
      const athletes = await this.users
        .find({ role: Role.Athlete, gender: gender })
        .toArray();
      return { athletes };
    } catch (dbError) {
      console.error(
        "Database error during fetching athletes by gender:",
        dbError
      );
      return {
        error: "Failed to fetch athletes due to a database operation error.",
      };
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
  async getUserRole(userId: UserID): Promise<Role | null | { error: string }> {
    const user = await this.users.findOne({ _id: userId as UserID });

    if (!user) {
      return { error: `user with the id ${userId} does not exist.` };
    }

    const role = user.role;
    if (role === undefined) {
      return null;
    }

    return role;
  }
}
