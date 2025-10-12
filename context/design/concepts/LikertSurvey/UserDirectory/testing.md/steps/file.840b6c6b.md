---
timestamp: 'Sat Oct 11 2025 17:42:06 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_174206.fa3a6940.md]]'
content_id: 840b6c6b5606bc426ab396e8c2787496257a67ecababff5f2c1e37e2dd804dba
---

# file: src/userdirectory/UserDirectoryConcept.ts

```typescript
import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

// Collection prefix to ensure namespace separation
const PREFIX = "UserDirectory" + ".";

// Internal entity type, represented as an ID
type User = ID;

/**
 * State: A set of Users with a unique username, unique email, and an optional name.
 */
interface UserDoc {
  _id: User; // MongoDB document ID
  username: string;
  email: string;
  name?: string; // Optional field
}

/**
 * @concept UserDirectory
 * @purpose To manage a core registry of user identities and their fundamental contact information (username, email), enabling lookup and basic information updates.
 */
export default class UserDirectoryConcept {
  users: Collection<UserDoc>;

  constructor(private readonly db: Db) {
    this.users = this.db.collection(PREFIX + "users");
    // Ensure uniqueness for username and email for efficient lookups and integrity
    this.users.createIndex({ username: 1 }, { unique: true, background: true });
    this.users.createIndex({ email: 1 }, { unique: true, background: true });
  }

  /**
   * Action: Registers a new user.
   * @param username - The unique username for the new user.
   * @param email - The unique email address for the new user.
   * @param name - An optional display name for the user.
   * @returns An object containing the new user's ID on success, or an error message.
   * @requires username must be non-empty and unique.
   * @requires email must be non-empty and unique.
   * @effects A new user entry is created with the provided details, and its ID is returned.
   */
  async registerUser({ username, email, name }: { username: string; email: string; name?: string }): Promise<{ user: User } | { error: string }> {
    if (!username || username.trim() === "") {
      return { error: "Username cannot be empty." };
    }
    if (!email || email.trim() === "") {
      return { error: "Email cannot be empty." };
    }

    // Check for existing username or email to enforce uniqueness
    const existingUserByUsername = await this.users.findOne({ username });
    if (existingUserByUsername) {
      return { error: `Username '${username}' is already taken.` };
    }
    const existingUserByEmail = await this.users.findOne({ email });
    if (existingUserByEmail) {
      return { error: `Email '${email}' is already in use.` };
    }

    const userId = freshID() as User;
    const newUser: UserDoc = { _id: userId, username, email };
    if (name) {
      newUser.name = name;
    }

    await this.users.insertOne(newUser);
    return { user: userId };
  }

  /**
   * Action: Updates the display name of an existing user.
   * @param user - The ID of the user to update.
   * @param newName - The new display name for the user.
   * @returns An empty object on success, or an error message.
   * @requires The user must exist.
   * @requires newName must be non-empty.
   * @effects The display name of the specified user is updated.
   */
  async updateUserName({ user, newName }: { user: User; newName: string }): Promise<Empty | { error: string }> {
    if (!newName || newName.trim() === "") {
      return { error: "New name cannot be empty." };
    }

    const result = await this.users.updateOne({ _id: user }, { $set: { name: newName } });

    if (result.matchedCount === 0) {
      return { error: `User with ID ${user} not found.` };
    }

    return {};
  }

  /**
   * Action: Updates the email address of an existing user.
   * @param user - The ID of the user to update.
   * @param newEmail - The new unique email address for the user.
   * @returns An empty object on success, or an error message.
   * @requires The user must exist.
   * @requires newEmail must be non-empty and unique among other users.
   * @effects The email address of the specified user is updated.
   */
  async updateUserEmail({ user, newEmail }: { user: User; newEmail: string }): Promise<Empty | { error: string }> {
    if (!newEmail || newEmail.trim() === "") {
      return { error: "New email cannot be empty." };
    }

    // Check if the new email is already in use by another user (excluding the current user)
    const existingUserWithNewEmail = await this.users.findOne({ email: newEmail, _id: { $ne: user } });
    if (existingUserWithNewEmail) {
      return { error: `Email '${newEmail}' is already in use by another user.` };
    }

    const result = await this.users.updateOne({ _id: user }, { $set: { email: newEmail } });

    if (result.matchedCount === 0) {
      return { error: `User with ID ${user} not found.` };
    }

    return {};
  }

  /**
   * Query: Retrieves a user document by username.
   * @param username - The username to look up.
   * @returns The user document if found, otherwise `null`.
   * @effects Returns the user document associated with the username, or null if not found.
   */
  async _getUserByUsername({ username }: { username: string }): Promise<UserDoc | null> {
    return await this.users.findOne({ username });
  }

  /**
   * Query: Retrieves a user document by email.
   * @param email - The email address to look up.
   * @returns The user document if found, otherwise `null`.
   * @effects Returns the user document associated with the email, or null if not found.
   */
  async _getUserByEmail({ email }: { email: string }): Promise<UserDoc | null> {
    return await this.users.findOne({ email });
  }

  /**
   * Query: Retrieves a user document by its ID.
   * @param user - The ID of the user to retrieve.
   * @returns The user document if found, otherwise `null`.
   * @effects Returns the user document for a given user ID, or null if not found.
   */
  async _getUserById({ user }: { user: User }): Promise<UserDoc | null> {
    return await this.users.findOne({ _id: user });
  }
}
```
