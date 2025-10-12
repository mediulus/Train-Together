---
timestamp: 'Sat Oct 11 2025 15:21:47 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_152147.a4420d33.md]]'
content_id: a8f3b0b6dc1b753c3a73d288746196e648450e8b2d33e7b8221041204a425323
---

# prompt: UserDirectory this is my UserDirectory Concept. Help me with the ts implementation.

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
