[@implementation](../implementation.md)

[@testing-concepts](../../../background/testing-concepts.md)

# test: UserDirectory


# response:

# concept: UserDirectory

*   **concept**: UserDirectory
*   **purpose**: To manage a core registry of user identities and their fundamental contact information (username, email), enabling lookup and basic information updates.
*   **principle**: If a new user is registered with a unique username and email address, they can then be looked up by that username or email, and attempts to register another user with the same unique identifiers will fail.
*   **state**:
    *   A set of `Users` with
        *   a `username` of type `String` (unique)
        *   an `email` of type `String` (unique)
        *   a `name` of type `String` (optional)
*   **actions**:
    *   `registerUser (username: String, email: String, name?: String): ({ user: User } | { error: String })`
        *   **requires**: `username` must be non-empty and unique. `email` must be non-empty and unique.
        *   **effects**: A new user entry is created with the provided details, and its ID is returned.
    *   `updateUserName (user: User, newName: String): (Empty | { error: String })`
        *   **requires**: The `user` must exist. `newName` must be non-empty.
        *   **effects**: The display `name` of the specified user is updated.
    *   `updateUserEmail (user: User, newEmail: String): (Empty | { error: String })`
        *   **requires**: The `user` must exist. `newEmail` must be non-empty and unique among other users.
        *   **effects**: The `email` address of the specified user is updated.
*   **queries**:
    *   `_getUserByUsername (username: String): (UserDoc | null)`
        *   **effects**: Returns the user document (`_id`, `username`, `email`, `name`) associated with the `username`, or `null` if not found.
    *   `_getUserByEmail (email: String): (UserDoc | null)`
        *   **effects**: Returns the user document (`_id`, `username`, `email`, `name`) associated with the `email`, or `null` if not found.
    *   `_getUserById (user: User): (UserDoc | null)`
        *   **effects**: Returns the user document (`_id`, `username`, `email`, `name`) for a given user ID, or `null` if not found.

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

# file: src/userdirectory/UserDirectoryConcept.test.ts

```typescript
import { assertEquals, assertExists, assertNotEquals, assertNull } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import { ID } from "@utils/types.ts";
import UserDirectoryConcept from "./UserDirectoryConcept.ts";

// Test data constants
const USER_ALICE_USERNAME = "alice_user";
const USER_ALICE_EMAIL = "alice@example.com";
const USER_ALICE_NAME = "Alice Smith";
const USER_BOB_USERNAME = "bob_user";
const USER_BOB_EMAIL = "bob@example.com";
const USER_BOB_NAME = "Bob Johnson";

Deno.test("UserDirectory Concept", async (t) => {
  const [db, client] = await testDb();
  const userDirectory = new UserDirectoryConcept(db);

  let aliceId: ID; // To store Alice's ID for subsequent tests
  let bobId: ID;   // To store Bob's ID for subsequent tests

  await t.step("should register a new user (Alice) successfully", async () => {
    const result = await userDirectory.registerUser({
      username: USER_ALICE_USERNAME,
      email: USER_ALICE_EMAIL,
      name: USER_ALICE_NAME,
    });

    assertExists(result, "Expected a result from registerUser");
    if ("error" in result) {
      assertEquals(result.error, undefined, `Expected no error, but got: ${result.error}`);
      throw new Error(`Registration of Alice failed: ${result.error}`); // Fail test if unexpected error
    } else {
      assertExists(result.user, "Expected a user ID to be returned");
      aliceId = result.user; // Store Alice's ID
      const user = await userDirectory._getUserById({ user: aliceId });
      assertExists(user, "Expected Alice's user document to be found by ID");
      assertEquals(user.username, USER_ALICE_USERNAME, "Username mismatch for Alice");
      assertEquals(user.email, USER_ALICE_EMAIL, "Email mismatch for Alice");
      assertEquals(user.name, USER_ALICE_NAME, "Name mismatch for Alice");
    }
  });

  await t.step("should prevent registration with a duplicate username", async () => {
    const result = await userDirectory.registerUser({
      username: USER_ALICE_USERNAME, // Duplicate username
      email: "another_alice@example.com",
    });

    assertExists(result, "Expected a result from duplicate username registration attempt");
    if (!("error" in result)) {
      assertEquals(result.user, undefined, "Expected an error for duplicate username, but user was created.");
    } else {
      assertEquals(result.error, `Username '${USER_ALICE_USERNAME}' is already taken.`, "Incorrect error for duplicate username");
    }
  });

  await t.step("should prevent registration with a duplicate email", async () => {
    const result = await userDirectory.registerUser({
      username: "another_alice_user",
      email: USER_ALICE_EMAIL, // Duplicate email
    });

    assertExists(result, "Expected a result from duplicate email registration attempt");
    if (!("error" in result)) {
      assertEquals(result.user, undefined, "Expected an error for duplicate email, but user was created.");
    } else {
      assertEquals(result.error, `Email '${USER_ALICE_EMAIL}' is already in use.`, "Incorrect error for duplicate email");
    }
  });

  await t.step("should prevent registration with empty username or email", async () => {
    let result = await userDirectory.registerUser({ username: "", email: "valid@example.com" });
    if (!("error" in result)) assertEquals(result.user, undefined, "Expected error for empty username, but succeeded");
    else assertEquals(result.error, "Username cannot be empty.", "Incorrect error for empty username");

    result = await userDirectory.registerUser({ username: "validuser", email: "" });
    if (!("error" in result)) assertEquals(result.user, undefined, "Expected error for empty email, but succeeded");
    else assertEquals(result.error, "Email cannot be empty.", "Incorrect error for empty email");
  });

  await t.step("should register another user (Bob) successfully", async () => {
    const result = await userDirectory.registerUser({
      username: USER_BOB_USERNAME,
      email: USER_BOB_EMAIL,
      name: USER_BOB_NAME,
    });
    if ("error" in result) {
      throw new Error(`Failed to register Bob: ${result.error}`);
    }
    bobId = result.user; // Store Bob's ID
    assertExists(bobId, "Expected Bob's user ID to be returned");
  });

  await t.step("should retrieve a user by username", async () => {
    const user = await userDirectory._getUserByUsername({ username: USER_ALICE_USERNAME });
    assertExists(user, "Expected Alice's user document to be found by username");
    assertEquals(user._id, aliceId, "Retrieved user ID mismatch");
    assertEquals(user.email, USER_ALICE_EMAIL, "Retrieved user email mismatch");
    assertEquals(user.name, USER_ALICE_NAME, "Retrieved user name mismatch");
  });

  await t.step("should retrieve a user by email", async () => {
    const user = await userDirectory._getUserByEmail({ email: USER_ALICE_EMAIL });
    assertExists(user, "Expected Alice's user document to be found by email");
    assertEquals(user._id, aliceId, "Retrieved user ID mismatch");
    assertEquals(user.username, USER_ALICE_USERNAME, "Retrieved user username mismatch");
    assertEquals(user.name, USER_ALICE_NAME, "Retrieved user name mismatch");
  });

  await t.step("should return null for non-existent username", async () => {
    const user = await userDirectory._getUserByUsername({ username: "non_existent" });
    assertNull(user, "Expected null for non-existent username");
  });

  await t.step("should return null for non-existent email", async () => {
    const user = await userDirectory._getUserByEmail({ email: "non_existent@example.com" });
    assertNull(user, "Expected null for non-existent email");
  });

  await t.step("should update a user's name successfully", async () => {
    const newName = "Alice Wonderland";
    const updateResult = await userDirectory.updateUserName({ user: aliceId, newName });
    assertExists(updateResult, "Expected a result from updateUserName");
    if ("error" in updateResult) {
      assertEquals(updateResult.error, undefined, `Expected no error, got: ${updateResult.error}`);
    } else {
      const updatedAlice = await userDirectory._getUserById({ user: aliceId });
      assertExists(updatedAlice, "Expected updated Alice document to be found");
      assertEquals(updatedAlice.name, newName, "Alice's name was not updated correctly");
    }
  });

  await t.step("should prevent updating user name with empty string", async () => {
    const updateResult = await userDirectory.updateUserName({ user: aliceId, newName: "" });
    assertExists(updateResult, "Expected a result from updateUserName with empty name");
    if (!("error" in updateResult)) assertEquals(updateResult, {}, "Expected an error, but name was updated.");
    else assertEquals(updateResult.error, "New name cannot be empty.", "Incorrect error for empty name update");
  });

  await t.step("should prevent updating a non-existent user's name", async () => {
    const updateResult = await userDirectory.updateUserName({ user: "non_existent_user_id" as ID, newName: "Fake User" });
    assertExists(updateResult, "Expected a result from updateUserName for non-existent user");
    if (!("error" in updateResult)) assertEquals(updateResult, {}, "Expected an error, but name was updated.");
    else assertEquals(updateResult.error, "User with ID non_existent_user_id not found.", "Incorrect error for non-existent user name update");
  });

  await t.step("should update a user's email successfully", async () => {
    const newEmail = "alice.new@example.com";
    const updateResult = await userDirectory.updateUserEmail({ user: aliceId, newEmail });
    assertExists(updateResult, "Expected a result from updateUserEmail");
    if ("error" in updateResult) {
      assertEquals(updateResult.error, undefined, `Expected no error, got: ${updateResult.error}`);
    } else {
      const updatedAlice = await userDirectory._getUserById({ user: aliceId });
      assertExists(updatedAlice, "Expected updated Alice document to be found");
      assertEquals(updatedAlice.email, newEmail, "Alice's email was not updated correctly");
    }
  });

  await t.step("should prevent updating user email with empty string", async () => {
    const updateResult = await userDirectory.updateUserEmail({ user: aliceId, newEmail: "" });
    assertExists(updateResult, "Expected a result from updateUserEmail with empty email");
    if (!("error" in updateResult)) assertEquals(updateResult, {}, "Expected an error, but email was updated.");
    else assertEquals(updateResult.error, "New email cannot be empty.", "Incorrect error for empty email update");
  });

  await t.step("should prevent updating user email to an already used email (Bob's email)", async () => {
    const updateResult = await userDirectory.updateUserEmail({ user: aliceId, newEmail: USER_BOB_EMAIL }); // Bob's email
    assertExists(updateResult, "Expected a result from updateUserEmail with duplicate email");
    if (!("error" in updateResult)) assertEquals(updateResult, {}, "Expected an error, but email was updated.");
    else assertEquals(updateResult.error, `Email '${USER_BOB_EMAIL}' is already in use by another user.`, "Incorrect error for duplicate email update");
  });

  await t.step("should prevent updating a non-existent user's email", async () => {
    const updateResult = await userDirectory.updateUserEmail({ user: "non_existent_user_id" as ID, newEmail: "fake@example.com" });
    assertExists(updateResult, "Expected a result from updateUserEmail for non-existent user");
    if (!("error" in updateResult)) assertEquals(updateResult, {}, "Expected an error, but email was updated.");
    else assertEquals(updateResult.error, "User with ID non_existent_user_id not found.", "Incorrect error for non-existent user email update");
  });

  await t.step("Trace: Principle fulfillment", async () => {
    console.log("\n--- Principle Fulfillment Trace Start ---");

    // 1. Register a new user (Charlie)
    const charlieUsername = "charlie_chaplin";
    const charlieEmail = "charlie@movies.com";
    const charlieName = "Charlie Chaplin";

    const registerResult = await userDirectory.registerUser({
      username: charlieUsername,
      email: charlieEmail,
      name: charlieName,
    });
    if ("error" in registerResult) {
      throw new Error(`Principle Trace failed: Could not register Charlie: ${registerResult.error}`);
    }
    const charlieId = registerResult.user;
    assertExists(charlieId, "Charlie's ID should be returned after registration");
    console.log(`1. Registered Charlie with ID: ${charlieId}, username: ${charlieUsername}, email: ${charlieEmail}`);

    // 2. Verify Charlie can be looked up by username
    const lookupByUsername = await userDirectory._getUserByUsername({ username: charlieUsername });
    assertExists(lookupByUsername, `Charlie should be found by username: ${charlieUsername}`);
    assertEquals(lookupByUsername._id, charlieId, "Lookup by username ID mismatch");
    assertEquals(lookupByUsername.email, charlieEmail, "Lookup by username email mismatch");
    assertEquals(lookupByUsername.name, charlieName, "Lookup by username name mismatch");
    console.log(`2. Looked up Charlie by username '${charlieUsername}'. Found.`);

    // 3. Verify Charlie can be looked up by email
    const lookupByEmail = await userDirectory._getUserByEmail({ email: charlieEmail });
    assertExists(lookupByEmail, `Charlie should be found by email: ${charlieEmail}`);
    assertEquals(lookupByEmail._id, charlieId, "Lookup by email ID mismatch");
    assertEquals(lookupByEmail.username, charlieUsername, "Lookup by email username mismatch");
    assertEquals(lookupByEmail.name, charlieName, "Lookup by email name mismatch");
    console.log(`3. Looked up Charlie by email '${charlieEmail}'. Found.`);

    // 4. Attempt to register another user with Charlie's username (should fail)
    const duplicateUsernameResult = await userDirectory.registerUser({
      username: charlieUsername,
      email: "charlie_clone@movies.com",
    });
    assertExists(duplicateUsernameResult, "Expected a result from duplicate username registration");
    if (!("error" in duplicateUsernameResult)) {
      throw new Error("Principle Trace failed: Expected duplicate username registration to fail, but it succeeded.");
    }
    assertEquals(duplicateUsernameResult.error, `Username '${charlieUsername}' is already taken.`, "Incorrect error for duplicate username registration");
    console.log(`4. Successfully prevented duplicate username registration for: ${charlieUsername}`);

    // 5. Attempt to register another user with Charlie's email (should fail)
    const duplicateEmailResult = await userDirectory.registerUser({
      username: "charlie_clone_user",
      email: charlieEmail,
    });
    assertExists(duplicateEmailResult, "Expected a result from duplicate email registration");
    if (!("error" in duplicateEmailResult)) {
      throw new Error("Principle Trace failed: Expected duplicate email registration to fail, but it succeeded.");
    }
    assertEquals(duplicateEmailResult.error, `Email '${charlieEmail}' is already in use.`, "Incorrect error for duplicate email registration");
    console.log(`5. Successfully prevented duplicate email registration for: ${charlieEmail}`);

    console.log("--- Principle Fulfillment Trace End: Successfully demonstrated user registration, lookup, and uniqueness constraints. ---");
  });

  await client.close();
});
```