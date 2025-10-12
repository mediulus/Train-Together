---
timestamp: 'Sat Oct 11 2025 17:42:06 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_174206.fa3a6940.md]]'
content_id: 44d7414f31f7e55efbac2fc16337e24f21d45c3e94b0118d0d9a1a38b39d4dc1
---

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
