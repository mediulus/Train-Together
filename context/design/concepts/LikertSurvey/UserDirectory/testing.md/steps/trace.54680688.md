---
timestamp: 'Sat Oct 11 2025 17:35:51 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_173551.c5358a73.md]]'
content_id: 54680688885ae555e6041927fc5d3aee483b0ae9efdf55f1c30691f9bd042bbb
---

# trace: Administrator manages user 'Alice Smith'

This trace demonstrates the `UserDirectory` concept fulfilling its principle:

1. **Action**: `UserDirectory.createUser({ displayName: "Alice Smith" })`
   * **Input**: `displayName: "Alice Smith"`
   * **Expected Outcome**: Returns `{ user: aliceId }` (a new unique ID for Alice).
   * **State Change**: A new `UserDoc` document is inserted into the `users` collection with `_id: aliceId`, `displayName: "Alice Smith"`, and `status: "active"`.

2. **Query**: `UserDirectory._getUser({ user: aliceId })`
   * **Input**: `user: aliceId`
   * **Expected Outcome**: Returns `{ _id: aliceId, displayName: "Alice Smith", status: "active" }`.
   * **Verification**: This confirms that Alice's initial details are correctly stored and retrievable, verifying her "active" status.

3. **Action**: `UserDirectory.updateUserDisplayName({ user: aliceId, newDisplayName: "Alice J. Smith" })`
   * **Input**: `user: aliceId`, `newDisplayName: "Alice J. Smith"`
   * **Expected Outcome**: Returns `{}` (empty object for success).
   * **State Change**: The `UserDoc` for `aliceId` in the `users` collection is updated, changing `displayName` to `"Alice J. Smith"`. The `status` remains `"active"`.

4. **Query**: `UserDirectory._getUser({ user: aliceId })`
   * **Input**: `user: aliceId`
   * **Expected Outcome**: Returns `{ _id: aliceId, displayName: "Alice J. Smith", status: "active" }`.
   * **Verification**: This confirms the display name update was successful and the status remained unchanged.

5. **Action**: `UserDirectory.setUserStatus({ user: aliceId, status: "suspended" })`
   * **Input**: `user: aliceId`, `status: "suspended"`
   * **Expected Outcome**: Returns `{}` (empty object for success).
   * **State Change**: The `UserDoc` for `aliceId` in the `users` collection is updated, changing `status` to `"suspended"`. The `displayName` remains `"Alice J. Smith"`.

6. **Query**: `UserDirectory._getUser({ user: aliceId })`
   * **Input**: `user: aliceId`
   * **Expected Outcome**: Returns `{ _id: aliceId, displayName: "Alice J. Smith", status: "suspended" }`.
   * **Verification**: This confirms that Alice's account has been successfully suspended, demonstrating the full lifecycle described in the principle.
