import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

const PREFIX = "UserDirectory" + ".";

type UserID = ID;
/**
 * @concept UserDirectory
 * @purpose Register and manage users of the system with unique emails and roles.
 */

export enum Role {
    Coach = "coach",
    Athlete = "athlete",
}

export enum Gender {
  Female = "female",
  Male = "male"
}

interface User {
    _id: UserID;
    name: string;
    email: string;
    role: Role;
    accountPassword: string;
    weeklyMileage: number | null;
    gender: Gender
}

/**
 * @concept UserDirectory
 * @purpose Register and manage users of the system with unique emails and roles.
 * @principle After a user registers with a role, they can be referenced by other concepts.
 */
export default class UserDirectoryConcept {
    private users: Collection<User>;
    
    constructor(private readonly db: Db) {
    this.users = this.db.collection(PREFIX + "users");
    // Ensure that the 'email' field is unique to fulfill the 'register' action's requirement.
    this.users.createIndex({ email: 1 }, { unique: true }).catch((err) =>
      console.error(
        `Error creating unique index for UserDirectory.users.email: ${err}`,
      )
    );
  }

  /**
   * @action register
   *
   * @param {object} args - The arguments for the register action.
   * @param {string} args.email - The unique email address for the new user.
   * @param {string} args.name - The user's full name.
   * @param {string} args.password - The user's account password.
   * @param {Role} args.role - The role of the user (coach or athlete).
   * @param {Gender} args.gender - The gender of the user
   *
   * @returns {Promise<{ user: User } | { error: string }>} - Returns the ID of the new user on success, or an error message if a user with that email already exists.
   *
   * @requires no user exists with that email
   * @effects creates a new User model with email = email, name = name, role = role, and accountPassword = password
   */
  async register(
    {email, name, password, role, gender}: {
      email: string;
      name: string;
      password: string;
      role: Role,
      gender: Gender
    }
  ) : Promise<{ user: UserID } | { error: string }> {
    // Check precondition: no user exists with that email
    const existingUser = await this.users.findOne({ email });
    if (existingUser) {
      return { error: "A user with that email already exists." };
    }

    const weeklyMileage = role === Role.Athlete ? 0 : null;

    const newUser: User = {
      _id: freshID() as UserID,
      name,
      email,
      role,
      accountPassword: password,
      weeklyMileage,
      gender
    };

    try {
      const result = await this.users.insertOne(newUser);
      if (result.acknowledged) {
        return { user: newUser._id };
      } else {
        // This case indicates a deeper database issue, not a precondition failure
        return { error: "Failed to register user due to an unknown database error." };
      }
    } catch (dbError) {
      // Catch potential errors during insertion (e.g., if unique index was violated concurrently)
      console.error("Database error during user registration:", dbError);
      return { error: "Failed to register user due to a database operation error." };
    }
  }

/**
   * @action setWeeklyMileage
   *
   * @param {object} args - The arguments for the setWeeklyMileage action.
   * @param {string} args.user_id - The id of the user whose mileage is to be set.
   * @param {number} args.weeklyMileage - The weekly mileage to set for the user.
   *
   * @returns {Promise<Empty | { error: string }>} - Returns an empty object on success, or an error message if the user is not found or is not an athlete.
   *
   * @requires User exists with that email and has role = athlete
   * @effects user.weeklyMileage = weeklyMileage
*/

async setWeeklyMileage({ user_id, weeklyMileage }: {user_id: UserID; weeklyMileage: number }): Promise<Empty | { error: string }> {
  const user = await this.users.findOne({ _id: user_id as UserID });
  if (!user) {
    return { error: "User not found." };
  }
  if (user.role !== Role.Athlete) {
    return { error: "Only athletes can have weekly mileage set." };
  }

  try {
    const result = await this.users.updateOne(
      {_id:user_id},
      { $set: { weeklyMileage } }
    );

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
   * @query getAthleteMileage
   * Retrieves the weekly mileage for an athlete by their email.
   * @param {object} args - The query arguments.
   * @param {string} args.user_id - The email of the athlete.
   * @returns {Promise<{ weeklyMileage: number | null } | { error: string }>} The mileage or an error.
   */
  async getAthleteMileage({user_id}: {user_id: UserID}): Promise<{ weeklyMileage: number | null } | { error: string }> {
    const user = await this.users.findOne({ _id: user_id as UserID });
    
    if (!user) {
      return { error: "User not found." };
    } 

    if (user.role !== Role.Athlete) {
      return { error: "Only athletes have weekly mileage." };
    } 
    
    return {weeklyMileage: user.weeklyMileage};
  }

  /**
   * @query getAthletesByGender
   * Retrieves a list of athletes filtered by gender
   * @param {object} args - The query arguments.
   * @param {Gender} args.gender - The gender to filter athletes by.      
   * @returns {Promise<{ athletes: User[] } | { error: string }>} The list of athletes or an error.
   */
  async getAthletesByGender({gender}: {gender: Gender}): Promise<{ athletes: User[] } | { error: string }> {
    try {
      const athletes = await this.users.find({ role : Role.Athlete, gender: gender }).toArray();
      return { athletes };

    } catch (dbError) {
      console.error("Database error during fetching athletes by gender:", dbError);
      return { error: "Failed to fetch athletes due to a database operation error." };
    }
  }
   
}

