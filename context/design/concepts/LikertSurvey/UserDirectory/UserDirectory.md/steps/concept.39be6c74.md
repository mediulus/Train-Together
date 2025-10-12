---
timestamp: 'Sat Oct 11 2025 14:56:53 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_145653.89c0d7cd.md]]'
content_id: 39be6c7444e8fdd60151170a8cfbd29eab919a64369fa5fb5e82c27eafd28ff8
---

# concept: UserDirectory this is my UserDirectory Concept. Help me with the ts implementation.

concept UserDirectory
purpose: Register and manage users of the system with unique emails and roles.
principle: After a user registers with a role, they can be referenced by other concepts.

```
    state:
        a set of Users with:
            a name String
            an email String
            a role Enum{coach, athlete}
            an accountPassword String
            weeklyMileage: Number | null //athletes have mileage while coaches do not

    actions:
        register(email: String, name: String, password: String, role: Enum): (user: User)
            requires: no user exists with that email
            effects: creates a new User model with email = email, name = name, role = role, and accountPassword = password

        setWeeklyMileage(email: String, weeklyMileage: Number)
            requires: User exists with that email and has role = athlete
            effects: user.weeklyMileage = weeklyMileage
```
