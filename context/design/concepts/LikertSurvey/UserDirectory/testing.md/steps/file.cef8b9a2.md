---
timestamp: 'Sat Oct 11 2025 17:35:51 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_173551.c5358a73.md]]'
content_id: cef8b9a2e630b6ca33f0acec97dd4da25d2bdd6176ef302135eb669f50ac854c
---

# file: src/concepts/UserDirectory/UserDirectoryConcept.ts

```typescript
import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

// Collection prefix to ensure namespace separation
const PREFIX = "UserDirectory" + ".";

// Generic type for the concept's external dependencies (e.g., User IDs)
type User = ID;

// Valid user statuses defined for the concept
type UserStatus = "active" | "suspended" | "deleted";

/**
 * State: A set of Users with a displayName and a status.
 * This interface defines the structure of a user document in MongoDB.
 */
interface UserDoc {
  _id: User; // The ID of the user, acting as the primary identifier.
  displayName: string;
  status: UserStatus;
}

/**
 * @concept UserDirectory
 * @purpose To maintain a central listing of users within an application,
 * providing display names and status management, without handling
 * authentication or detailed profiles.
 */
export default class UserDirectoryConcept {
  // MongoDB collection for storing user documents
  users: Collection<UserDoc>;

  constructor(private readonly db: Db) {
    // Initialize the 'users' collection with the prefixed name
    this.users = this.db.collection(PREFIX + "users");
  }

  /**
   * Action: Creates a new user in the directory.
   * @param {object} params - The action parameters.
   * @param {string} params.displayName - The display name for the new user.
   * @returns {Promise<{ user: User } | { error: string }>} - The ID of the new user on success, or an error message.
   * @requires displayName must not be an empty string.
   * @effects A new user is created with the provided displayName and an initial status of "active".
   */
  async createUser({ displayName }: { displayName: string }): Promise<{ user: User } | { error: string }> {
    if (!displayName || displayName.trim() === "") {
      return { error: "Display name cannot be empty." };
    }

    const userId = freshID() as User; // Generate a fresh ID for the new user
    await this.users.insertOne({
      _id: userId,
      displayName,
      status: "active", // Default status for a newly created user
    });
    return { user: userId };
  }

  /**
   * Action: Updates the display name of an existing user.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user to update.
   * @param {string} params.newDisplayName - The new display name for the user.
   * @returns {Promise<Empty | { error: string }>} - An empty object on success, or an error message.
   * @requires The user must exist in the directory. newDisplayName must not be an empty string.
   * @effects The displayName of the specified user is updated.
   */
  async updateUserDisplayName({ user, newDisplayName }: { user: User; newDisplayName: string }): Promise<Empty | { error: string }> {
    if (!newDisplayName || newDisplayName.trim() === "") {
      return { error: "New display name cannot be empty." };
    }

    const result = await this.users.updateOne(
      { _id: user }, // Filter by user ID
      { $set: { displayName: newDisplayName } }, // Set the new display name
    );

    if (result.matchedCount === 0) {
      return { error: `User with ID ${user} not found.` };
    }

    return {};
  }

  /**
   * Action: Updates the status of an existing user.
   * @param {object} params - The action parameters.
   * @param {User} params.user - The ID of the user to update.
   * @param {UserStatus} params.status - The new status for the user.
   * @returns {Promise<Empty | { error: string }>} - An empty object on success, or an error message.
   * @requires The user must exist in the directory. The status must be one of "active", "suspended", or "deleted".
   * @effects The status of the specified user is updated.
   */
  async setUserStatus({ user, status }: { user: User; status: UserStatus }): Promise<Empty | { error: string }> {
    const validStatuses: UserStatus[] = ["active", "suspended", "deleted"];
    if (!validStatuses.includes(status)) {
      return { error: `Invalid status: ${status}. Must be one of ${validStatuses.join(", ")}.` };
    }

    const result = await this.users.updateOne(
      { _id: user }, // Filter by user ID
      { $set: { status } }, // Set the new status
    );

    if (result.matchedCount === 0) {
      return { error: `User with ID ${user} not found.` };
    }

    return {};
  }

  /**
   * Query: Retrieves a specific user by their ID.
   * @param {object} params - The query parameters.
   * @param {User} params.user - The ID of the user to retrieve.
   * @returns {Promise<UserDoc | null>} - The UserDoc for the specified user ID, or null if not found.
   * @effects Returns the UserDoc for the specified user ID, or null if not found.
   */
  async _getUser({ user }: { user: User }): Promise<UserDoc | null> {
    return await this.users.findOne({ _id: user });
  }

  /**
   * Query: Retrieves all users in the directory.
   * @returns {Promise<UserDoc[]>} - An array of all UserDoc objects.
   * @effects Returns an array of all UserDoc objects.
   */
  async _getAllUsers(): Promise<UserDoc[]> {
    return await this.users.find({}).toArray();
  }
}
```
