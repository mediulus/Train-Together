---
timestamp: 'Sat Oct 11 2025 18:03:16 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_180316.22884ce1.md]]'
content_id: d6f6a2f7b375baf138571718536afe90e432f598cae860578b3493a41060c255
---

# prompt: UserDirectory this is my TeamMembership Concept. Help me with the ts implementation.

```
  concept TeamMembership:
    purpose: Organize teams and their membership so coaches can create teams and athletes can join them.
    principle: After a coach creates a team with a unique name and passKey, athletes who know the passKey can join the team and remain members until they leave.

    state:
        a set of Teams with:
            a name String
            a passKey
            a coach User // User.role = coach -> invariant held in the actions
            athletes {Users} // User.role = athlete -> invariant held in the actions

    actions:
        createTeam(title: String, coach: User, passKey: String): (newTeam: Team)
            requires: no team with this name exists, coach exists and coach.role = coach
            effects: generates a new team object with name = title, coach = coach, passKey = passKey

        addAthlete(title: String, athlete: User, passkey: String)
            requires: Team exists with this title, passKey = team.passKey, athlete exists and athlete.role = athlete
            effects: adds the athlete to the team.athletes set

        removeAthlete(title: String, athleteName: String)
            requires: Team exists with this title, User exists with this name, that users.role = athlete, that user is in team.athletes
            effects: removes the athlete with that name from the team.athletes set
```
