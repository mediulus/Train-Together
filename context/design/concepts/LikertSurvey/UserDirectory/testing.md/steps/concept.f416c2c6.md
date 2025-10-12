---
timestamp: 'Sat Oct 11 2025 17:42:06 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_174206.fa3a6940.md]]'
content_id: f416c2c6cfa8b14736ac4671388e0820f212ce64426618bdda5ce3d570a46580
---

# concept: UserDirectory

* **concept**: UserDirectory
* **purpose**: To manage a core registry of user identities and their fundamental contact information (username, email), enabling lookup and basic information updates.
* **principle**: If a new user is registered with a unique username and email address, they can then be looked up by that username or email, and attempts to register another user with the same unique identifiers will fail.
* **state**:
  * A set of `Users` with
    * a `username` of type `String` (unique)
    * an `email` of type `String` (unique)
    * a `name` of type `String` (optional)
* **actions**:
  * `registerUser (username: String, email: String, name?: String): ({ user: User } | { error: String })`
    * **requires**: `username` must be non-empty and unique. `email` must be non-empty and unique.
    * **effects**: A new user entry is created with the provided details, and its ID is returned.
  * `updateUserName (user: User, newName: String): (Empty | { error: String })`
    * **requires**: The `user` must exist. `newName` must be non-empty.
    * **effects**: The display `name` of the specified user is updated.
  * `updateUserEmail (user: User, newEmail: String): (Empty | { error: String })`
    * **requires**: The `user` must exist. `newEmail` must be non-empty and unique among other users.
    * **effects**: The `email` address of the specified user is updated.
* **queries**:
  * `_getUserByUsername (username: String): (UserDoc | null)`
    * **effects**: Returns the user document (`_id`, `username`, `email`, `name`) associated with the `username`, or `null` if not found.
  * `_getUserByEmail (email: String): (UserDoc | null)`
    * **effects**: Returns the user document (`_id`, `username`, `email`, `name`) associated with the `email`, or `null` if not found.
  * `_getUserById (user: User): (UserDoc | null)`
    * **effects**: Returns the user document (`_id`, `username`, `email`, `name`) for a given user ID, or `null` if not found.
