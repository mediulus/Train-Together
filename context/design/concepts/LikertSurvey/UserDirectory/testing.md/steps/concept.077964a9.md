---
timestamp: 'Sat Oct 11 2025 17:35:51 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_173551.c5358a73.md]]'
content_id: 077964a9e6e6c2bb8183a24b2acfdd0399b189be97a61f09353604da0c75a384
---

# concept: UserDirectory

* **concept**: UserDirectory \[User]
* **purpose**: To maintain a central listing of users within an application, providing display names and status management, without handling authentication or detailed profiles.
* **principle**: An administrator creates a new user, "Alice Smith", in the directory. Later, another system component can look up Alice Smith by her user ID and retrieve her display name and verify her "active" status. The administrator can then change Alice's display name to "Alice J. Smith" or suspend her account.
* **state**:
  * A set of `Users` with
    * an `ID` (the `User` type parameter itself)
    * a `displayName` of type `String`
    * a `status` of type `String` (e.g., "active", "suspended", "deleted")
* **actions**:
  * `createUser (displayName: String): (user: User | error: String)`
    * **requires**: `displayName` must not be an empty string.
    * **effects**: A new user is created with the provided `displayName` and an initial `status` of "active". Returns the new `User` ID.
  * `updateUserDisplayName (user: User, newDisplayName: String): (Empty | error: String)`
    * **requires**: The `user` must exist in the directory. `newDisplayName` must not be an empty string.
    * **effects**: The `displayName` of the specified `user` is updated to `newDisplayName`.
  * `setUserStatus (user: User, status: String): (Empty | error: String)`
    * **requires**: The `user` must exist in the directory. The `status` must be one of "active", "suspended", or "deleted".
    * **effects**: The `status` of the specified `user` is updated to the provided `status`.
* **queries**:
  * `_getUser (user: User): (UserDoc | null)`
    * **effects**: Returns the `UserDoc` for the specified user ID, or `null` if not found.
  * `_getAllUsers (): (UserDoc[])`
    * **effects**: Returns an array of all `UserDoc` objects in the directory.
