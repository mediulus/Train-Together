---
timestamp: 'Sat Oct 11 2025 15:22:23 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_152223.0144aecf.md]]'
content_id: 91517cc41538b982831c5ce94072f4acffb7ed95818d385ce0b7a93c7700cd0c
---

# response:

Okay, this is a great concept! It clearly outlines the purpose, principle, state, and actions for user management. Let's translate it into a TypeScript implementation using MongoDB, following the provided guidelines.

First, we need to define the `Role` enum and the TypeScript interface for your `User` documents.

```typescript
// file: src/UserDirectory/UserDirectoryConcept.ts
import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts"; // Assuming this utility function exists

// Declare collection prefix, uses the concept name to avoid collisions
const PREFIX = "UserDirectory" + ".";

// Generic type for User, represented as an opaque ID (string)
type User = ID;

/**
 * @enum Role
 * Defines the possible roles a user can have within the system.
 */
export enum Role {
  Coach = "coach",
  Athlete = "athlete",
}

/**
 * @interface UserDocument
 * Represents the state of a single user within the UserDirectory concept.
 *
 * @state a set of Users with:
 *   a name String
 *   an email String
 *   a role Enum{coach, athlete}
 *   an accountPassword String
 *   weeklyMileage: Number | null //athletes have mileage while coaches do not
 */
interface UserDocument {
  _id: User; // The unique identifier for the user
  name: string;
  email: string; // Must be unique across all users
  role: Role;
  accountPassword: string; // NOTE: In a production application, this password should ALWAYS be hashed and salted!
  weeklyMileage: number | null; // Null for coaches, a number for athletes
}

/**
 * @concept UserDirectory
 * @purpose Register and manage users of the system with unique emails and roles.
 * @principle After a user registers with a role, they can be referenced by other concepts.
 */
export default class UserDirectoryConcept {
  private users: Collection<UserDocument>;

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
   *
   * @returns {Promise<{ user: User } | { error: string }>} - Returns the ID of the new user on success, or an error message if a user with that email already exists.
   *
   * @requires no user exists with that email
   * @effects creates a new User model with email = email, name = name, role = role, and accountPassword = password
   */
  async register(
    { email, name, password, role }: {
      email: string;
      name: string;
      password: string;
      role: Role;
    },
  ): Promise<{ user: User } | { error: string }> {
    // Check precondition: no user exists with that email
    const existingUser = await this.users.findOne({ email });
    if (existingUser) {
      return { error: "A user with that email already exists." };
    }

    // Determine initial weeklyMileage based on role
    const weeklyMileage = role === Role.Athlete ? 0 : null;

    const newUser: UserDocument = {
      _id: freshID() as User, // Generate a fresh unique ID for the new user
      name,
      email,
      role,
      accountPassword: password, // IMPORTANT: Hash passwords in a real application!
      weeklyMileage,
    };

    // Effect: creates a new User model
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
   * @param {string} args.email - The email of the user whose mileage is to be set.
   * @param {number} args.weeklyMileage - The weekly mileage to set for the user.
   *
   * @returns {Promise<Empty | { error: string }>} - Returns an empty object on success, or an error message if the user is not found or is not an athlete.
   *
   * @requires User exists with that email and has role = athlete
   * @effects user.weeklyMileage = weeklyMileage
   */
  async setWeeklyMileage(
    { email, weeklyMileage }: { email: string; weeklyMileage: number },
  ): Promise<Empty | { error: string }> {
    // Precondition: User exists with that email
    const user = await this.users.findOne({ email });
    if (!user) {
      return { error: "User not found." };
    }

    // Precondition: and has role = athlete
    if (user.role !== Role.Athlete) {
      return { error: "Only athletes can have weekly mileage set." };
    }

    // Effect: user.weeklyMileage = weeklyMileage
    try {
      const result = await this.users.updateOne(
        { _id: user._id },
        { $set: { weeklyMileage } },
      );

      if (result.acknowledged && result.modifiedCount === 1) {
        return {}; // Successfully updated
      } else if (result.acknowledged && result.modifiedCount === 0) {
        // User found, is athlete, but mileage was already the same. Still a success.
        return {};
      } else {
        // This indicates a database issue where the update wasn't acknowledged or didn't modify as expected
        return { error: "Failed to update weekly mileage due to a database error." };
      }
    } catch (dbError) {
      console.error("Database error during setWeeklyMileage:", dbError);
      return { error: "Failed to update weekly mileage due to a database operation error." };
    }
  }

  // --- Example Queries (useful for other concepts or UI, but not explicitly requested by spec) ---

  /**
   * @query _getUserProfile
   * Retrieves a user's full profile information by their ID.
   * @param {object} args - The query arguments.
   * @param {User} args.userId - The ID of the user to retrieve.
   * @returns {Promise<{ user: UserDocument } | { error: string }>} The user document or an error.
   */
  async _getUserProfile(
    { userId }: { userId: User },
  ): Promise<{ user: UserDocument } | { error: string }> {
    const user = await this.users.findOne({ _id: userId });
    if (!user) {
      return { error: "User not found." };
    }
    return { user };
  }

  /**
   * @query _getUsersByRole
   * Retrieves all users with a specific role.
   * @param {object} args - The query arguments.
   * @param {Role} args.role - The role to filter users by.
   * @returns {Promise<{ users: UserDocument[] }>} A list of user documents.
   */
  async _getUsersByRole(
    { role }: { role: Role },
  ): Promise<{ users: UserDocument[] }> {
    const users = await this.users.find({ role }).toArray();
    return { users };
  }

  /**
   * @query _getAthleteMileageByEmail
   * Retrieves the weekly mileage for an athlete by their email.
   * @param {object} args - The query arguments.
   * @param {string} args.email - The email of the athlete.
   * @returns {Promise<{ weeklyMileage: number | null } | { error: string }>} The mileage or an error.
   */
  async _getAthleteMileageByEmail(
    { email }: { email: string },
  ): Promise<{ weeklyMileage: number | null } | { error: string }> {
    const user = await this.users.findOne({ email });
    if (!user) {
      return { error: "User not found." };
    }
    if (user.role !== Role.Athlete) {
      return { error: "User is not an athlete." };
    }
    return { weeklyMileage: user.weeklyMileage };
  }
}
```

### Explanation and Key Considerations:

1. **`User` Type:** The `User` type is an `ID` (which maps to a branded string), representing the unique identifier for a user. This adheres to the polymorphic nature of generic types in concept design.
2. **`Role` Enum:** A TypeScript `enum` is used for `Role` to provide type safety and clarity, directly matching your concept spec.
3. **`UserDocument` Interface:** This interface mirrors your `state` definition for a single user, including the `_id` field required by MongoDB.
   * **Password Security:** I've added a crucial comment about hashing passwords. Storing plain passwords (`accountPassword: string`) is a major security vulnerability in real applications. Always hash and salt passwords before storing them. For this exercise, I've followed your spec literally, but keep this in mind!
   * **`weeklyMileage` Initialization:** When registering a user, `weeklyMileage` is conditionally set to `0` for `athletes` and `null` for `coaches`, as per your state definition.
4. **MongoDB Collection:** The `UserDirectoryConcept` class initializes a `users` collection in its constructor. The `PREFIX` helps prevent naming collisions if you have other concepts with similar collection names.
5. **Unique Email Index:** Inside the constructor, `this.users.createIndex({ email: 1 }, { unique: true })` is called. This is crucial for enforcing the `register` action's `requires: no user exists with that email` condition at the database level, ensuring data integrity even under concurrent registration attempts.
6. **`register` Action:**
   * It first checks for an existing user with the given `email`. If found, it returns an `{ error: string }` object, as per the concept design's error handling guidelines.
   * A new `_id` for the user is generated using `freshID()` utility.
   * The `newUser` object is constructed and inserted into the `users` collection.
   * On successful insertion, it returns `{ user: newUser._id }`.
7. **`setWeeklyMileage` Action:**
   * It first finds the user by `email` and then checks if the user exists.
   * It then verifies that the `user.role` is `Role.Athlete` before allowing the update. If any precondition fails, it returns an `{ error: string }`.
   * If all preconditions are met, it uses `updateOne` to set the `weeklyMileage`.
   * Returns `{}` for success, as specified by the `Empty` type for actions without specific return data.
8. **Error Handling:** All actions are designed to return `{ error: "message" }` for expected validation/precondition failures, or for general database issues.
9. **Queries:** I've added a few example query methods (`_getUserProfile`, `_getUsersByRole`, `_getAthleteMileageByEmail`). While your spec didn't explicitly define queries, they are usually essential for retrieving information from a concept's state. They are prefixed with `_` as per the convention for query methods.
10. **Documentation:** JSDoc comments are used throughout to reflect the `purpose`, `principle`, `state` structure, and `requires`/`effects` of each action, which is vital for maintaining the concept's integrity and facilitating understanding.

This implementation provides a solid foundation for your `UserDirectory` concept within the concept design paradigm. Remember to replace `@utils/types.ts` and `@utils/database.ts` with your actual utility paths.
