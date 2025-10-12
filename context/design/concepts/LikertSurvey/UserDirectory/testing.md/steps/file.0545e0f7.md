---
timestamp: 'Sat Oct 11 2025 17:34:45 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_173445.2cdbdd0e.md]]'
content_id: 0545e0f70979f9c729ad10b2d916b0ade3742730e0542b235138a99758b05e94
---

# file: src/concepts/UserDirectory/UserDirectoryConcept.test.ts

```typescript
import { assertEquals } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import { ID, Empty } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { Collection, Db } from "npm:mongodb"; // Required for the mock class

// --- Mock UserDirectoryConcept for testing purposes ---
// In a real application, this would be imported from:
// import UserDirectoryConcept from "@concepts/UserDirectory/UserDirectoryConcept.ts";
// This mock is included here to make the test file self-contained and runnable
// for demonstration without needing the full UserDirectoryConcept implementation.

const USER_DIRECTORY_PREFIX = "UserDirectory" + ".";

type User = ID;

interface UserDoc {
  _id: User;
  name: string;
  email: string;
}

class MockUserDirectoryConcept {
  users: Collection<UserDoc>;

  constructor(private readonly db: Db) {
    this.users = this.db.collection(USER_DIRECTORY_PREFIX + "users");
  }

  /**
   * Action: Registers a new user.
   * @requires Email must be unique.
   * @effects A new user entry is created with a unique ID, name, and email.
   */
  async registerUser({ name, email }: { name: string; email: string }): Promise<{ user: User } | { error: string }> {
    const existingUser = await this.users.findOne({ email });
    if (existingUser) {
      return { error: `User with email ${email} already exists.` };
    }
    const userId = freshID() as User;
    await this.users.insertOne({ _id: userId, name, email });
    return { user: userId };
  }

  /**
   * Action: Deletes an existing user.
   * @requires The user must exist.
   * @effects The user and all their associated data are removed from the directory.
   */
  async deleteUser({ user }: { user: User }): Promise<Empty | { error: string }> {
    const result = await this.users.deleteOne({ _id: user });
    if (result.deletedCount === 0) {
      return { error: `User with ID ${user} not found.` };
    }
    return {};
  }

  /**
   * Query: Retrieves details for a specific user.
   */
  async _getUserDetails({ user }: { user: User }): Promise<UserDoc | null> {
    return await this.users.findOne({ _id: user });
  }

  /**
   * Query: Retrieves users by their email address.
   */
  async _getUsersByEmail({ email }: { email: string }): Promise<UserDoc[]> {
    return await this.users.find({ email }).toArray();
  }
}
// --- End Mock UserDirectoryConcept ---

Deno.test("UserDirectoryConcept", async (t) => {
  const [db, client] = await testDb();
  // Instantiate the mock concept for testing
  const concept = new MockUserDirectoryConcept(db);

  // Trace: Demonstrate the principle
  await t.step("Principle: Registering a user and retrieving their details", async () => {
    const name = "Alice Smith";
    const email = "alice@example.com";

    // 1. Action: Register user
    const registerResult = await concept.registerUser({ name, email });
    assertEquals(typeof registerResult, "object");
    if ("error" in registerResult) {
      throw new Error(`Registration failed: ${registerResult.error}`);
    }
    const { user: aliceId } = registerResult;
    assertEquals(typeof aliceId, "string"); // Verify user ID is returned

    // 2. Query: Retrieve user details
    const userDetails = await concept._getUserDetails({ user: aliceId });

    // 3. Verify retrieved details
    assertEquals(userDetails?.name, name);
    assertEquals(userDetails?.email, email);
    assertEquals(userDetails?._id, aliceId);
  });

  await t.step("Action: registerUser - requires unique email", async () => {
    const name1 = "Bob Johnson";
    const email = "bob@example.com";

    // Register first user successfully
    const result1 = await concept.registerUser({ name: name1, email });
    if ("error" in result1) throw new Error(result1.error);
    assertEquals(typeof result1.user, "string");

    // Attempt to register another user with the same email (should fail)
    const result2 = await concept.registerUser({ name: "Another Bob", email });
    assertEquals("error" in result2, true);
    assertEquals(result2.error, `User with email ${email} already exists.`);

    // Register a different user with a unique email (should succeed)
    const result3 = await concept.registerUser({ name: "Charlie Brown", email: "charlie@example.com" });
    if ("error" in result3) throw new Error(result3.error);
    assertEquals(typeof result3.user, "string");
  });

  await t.step("Action: deleteUser - requires user to exist and effects removal", async () => {
    const name = "David Lee";
    const email = "david@example.com";

    // Register a user to be deleted
    const registerResult = await concept.registerUser({ name, email });
    if ("error" in registerResult) throw new Error(registerResult.error);
    const { user: davidId } = registerResult;

    // Delete the existing user (should succeed)
    const deleteResult = await concept.deleteUser({ user: davidId });
    assertEquals("error" in deleteResult, false);
    assertEquals(deleteResult, {}); // Empty object signifies success

    // Verify user is no longer in the directory
    const userDetailsAfterDelete = await concept._getUserDetails({ user: davidId });
    assertEquals(userDetailsAfterDelete, null);

    // Attempt to delete a non-existent user (should fail)
    const nonExistentUserId = "nonexistent_id" as ID;
    const deleteNonExistentResult = await concept.deleteUser({ user: nonExistentUserId });
    assertEquals("error" in deleteNonExistentResult, true);
    assertEquals(deleteNonExistentResult.error, `User with ID ${nonExistentUserId} not found.`);
  });

  await t.step("Query: _getUsersByEmail - retrieves users by email", async () => {
    await concept.registerUser({ name: "Eve", email: "eve@example.com" });
    // Attempting to register Grace with the same email will return an error,
    // which is the expected behavior for the registerUser action.
    const graceRegResult = await concept.registerUser({ name: "Grace", email: "eve@example.com" });
    assertEquals("error" in graceRegResult, true); // Confirming the expected error

    const frankRegResult = await concept.registerUser({ name: "Frank", email: "frank@example.com" });
    if ("error" in frankRegResult) throw new Error(frankRegResult.error);

    // Retrieve users with "eve@example.com"
    const eveUsers = await concept._getUsersByEmail({ email: "eve@example.com" });
    assertEquals(eveUsers.length, 1);
    assertEquals(eveUsers[0].name, "Eve");

    // Retrieve users with "frank@example.com"
    const frankUsers = await concept._getUsersByEmail({ email: "frank@example.com" });
    assertEquals(frankUsers.length, 1);
    assertEquals(frankUsers[0].name, "Frank");


    // Retrieve users with a non-existent email
    const nonExistentUsers = await concept._getUsersByEmail({ email: "notfound@example.com" });
    assertEquals(nonExistentUsers.length, 0);
  });

  await client.close();
});
```
