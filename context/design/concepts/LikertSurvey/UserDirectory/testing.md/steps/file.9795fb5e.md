---
timestamp: 'Sat Oct 11 2025 17:35:51 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_173551.c5358a73.md]]'
content_id: 9795fb5ee20fc30358f83c4a81f230629a4a4fc418883a0806663f6bbc1321b6
---

# file: src/concepts/UserDirectory/UserDirectoryConcept.test.ts

```typescript
import { assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import UserDirectoryConcept from "./UserDirectoryConcept.ts";
import { ID } from "@utils/types.ts";

Deno.test("UserDirectoryConcept", async (t) => {
  const [db, client] = await testDb();
  const concept = new UserDirectoryConcept(db);

  Deno.test("initial state should be empty", async () => {
    const users = await concept._getAllUsers();
    assertEquals(users.length, 0);
  });

  await t.step("createUser action", async (t) => {
    await t.step("should create a new user with default status 'active'", async () => {
      const result = await concept.createUser({ displayName: "Alice Smith" });
      assertExists((result as { user: ID }).user, "Expected user ID to be returned");
      const userId = (result as { user: ID }).user;

      const user = await concept._getUser({ user: userId });
      assertExists(user, "User should exist in the directory");
      assertObjectMatch(user, {
        displayName: "Alice Smith",
        status: "active",
      });
      assertEquals(user._id, userId);
    });

    await t.step("should return an error if displayName is empty", async () => {
      const result = await concept.createUser({ displayName: "" });
      assertObjectMatch(result, { error: "Display name cannot be empty." });
    });

    await t.step("should return an error if displayName is just whitespace", async () => {
      const result = await concept.createUser({ displayName: "   " });
      assertObjectMatch(result, { error: "Display name cannot be empty." });
    });
  });

  let userId: ID; // To store a user ID for subsequent tests across steps

  await t.step("updateUserDisplayName action", async (t) => {
    // Setup: Create a user first for update tests
    const createResult = await concept.createUser({ displayName: "Bob Johnson" });
    assertExists((createResult as { user: ID }).user);
    userId = (createResult as { user: ID }).user;

    await t.step("should update the user's display name", async () => {
      const updateResult = await concept.updateUserDisplayName({ user: userId, newDisplayName: "Robert Johnson" });
      assertEquals(updateResult, {}, "Expected empty object for successful update");

      const updatedUser = await concept._getUser({ user: userId });
      assertExists(updatedUser, "User should still exist after name update");
      assertEquals(updatedUser.displayName, "Robert Johnson");
      assertEquals(updatedUser.status, "active"); // Status should remain unchanged
    });

    await t.step("should return an error if user does not exist", async () => {
      const nonExistentId = "nonExistentUser" as ID;
      const errorResult = await concept.updateUserDisplayName({ user: nonExistentId, newDisplayName: "New Name" });
      assertObjectMatch(errorResult, { error: `User with ID ${nonExistentId} not found.` });
    });

    await t.step("should return an error if newDisplayName is empty", async () => {
      const errorResult = await concept.updateUserDisplayName({ user: userId, newDisplayName: "" });
      assertObjectMatch(errorResult, { error: "New display name cannot be empty." });
    });
  });

  await t.step("setUserStatus action", async (t) => {
    // Setup: Ensure userId is available from previous step (Bob/Robert Johnson)
    assertExists(userId, "userId must be defined from previous step for status tests");

    await t.step("should update the user's status to 'suspended'", async () => {
      const updateResult = await concept.setUserStatus({ user: userId, status: "suspended" });
      assertEquals(updateResult, {}, "Expected empty object for successful status update");

      const updatedUser = await concept._getUser({ user: userId });
      assertExists(updatedUser);
      assertEquals(updatedUser.status, "suspended");
      assertEquals(updatedUser.displayName, "Robert Johnson"); // Display name should remain unchanged
    });

    await t.step("should update the user's status to 'deleted'", async () => {
      const updateResult = await concept.setUserStatus({ user: userId, status: "deleted" });
      assertEquals(updateResult, {}, "Expected empty object for successful status update");

      const updatedUser = await concept._getUser({ user: userId });
      assertExists(updatedUser);
      assertEquals(updatedUser.status, "deleted");
    });

    await t.step("should return an error if user does not exist", async () => {
      const nonExistentId = "nonExistentUser2" as ID;
      const errorResult = await concept.setUserStatus({ user: nonExistentId, status: "active" });
      assertObjectMatch(errorResult, { error: `User with ID ${nonExistentId} not found.` });
    });

    await t.step("should return an error if status is invalid", async () => {
      // Intentionally cast to any to test invalid input not caught by TypeScript
      const errorResult = await concept.setUserStatus({ user: userId, status: "invalid_status" as any });
      assertObjectMatch(errorResult, { error: "Invalid status: invalid_status. Must be one of active, suspended, deleted." });
    });
  });

  await t.step("Principle Trace: Administrator manages user 'Alice Smith'", async () => {
    // 1. An administrator creates a new user, "Alice Smith", in the directory.
    const createResult = await concept.createUser({ displayName: "Alice Smith" });
    assertExists((createResult as { user: ID }).user, "Expected user to be created");
    const aliceId = (createResult as { user: ID }).user;

    // Verify initial state
    let alice = await concept._getUser({ user: aliceId });
    assertExists(alice, "Alice should exist immediately after creation");
    assertEquals(alice.displayName, "Alice Smith");
    assertEquals(alice.status, "active");

    // 2. Later, another system component can look up Alice Smith by her user ID
    //    and retrieve her display name and verify her "active" status.
    const fetchedAlice = await concept._getUser({ user: aliceId });
    assertExists(fetchedAlice, "Alice should be retrievable by her ID");
    assertEquals(fetchedAlice.displayName, "Alice Smith", "Fetched Alice's display name should match");
    assertEquals(fetchedAlice.status, "active", "Fetched Alice's status should be 'active'");

    // 3. The administrator can then change Alice's display name to "Alice J. Smith"
    const updateNameResult = await concept.updateUserDisplayName({ user: aliceId, newDisplayName: "Alice J. Smith" });
    assertEquals(updateNameResult, {}, "Expected display name update to succeed for Alice");

    alice = await concept._getUser({ user: aliceId });
    assertExists(alice, "Alice should still exist after name update");
    assertEquals(alice.displayName, "Alice J. Smith", "Alice's display name should be updated");
    assertEquals(alice.status, "active", "Alice's status should remain unchanged after name update");

    // 4. or suspend her account.
    const suspendResult = await concept.setUserStatus({ user: aliceId, status: "suspended" });
    assertEquals(suspendResult, {}, "Expected status update to 'suspended' to succeed for Alice");

    alice = await concept._getUser({ user: aliceId });
    assertExists(alice, "Alice should still exist after status update");
    assertEquals(alice.displayName, "Alice J. Smith", "Alice's display name should remain unchanged after status update");
    assertEquals(alice.status, "suspended", "Alice's status should be 'suspended'");
  });

  // Ensure client is closed after all tests in this file
  await client.close();
});
```
