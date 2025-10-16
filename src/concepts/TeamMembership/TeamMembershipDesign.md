# TeamMembership — Design Change Summary

Streamlined to support common coach/athlete UI flows and keep role logic outside this concept. Key updates: stable team IDs, lookup helpers, and relaxed role checks (handled by UserDirectory or callers).

## Rationale
- Stable id avoids brittle name-based lookups and supports renames.
- Helpers (getTeamByCoach, etc.) reduce frontend plumbing.
- Role validation belongs with identity (UserDirectory), not membership.

## State Changes
- id: ID — canonical team identifier -- this is a new state
- coach: User — intent is “coach user” -- these roles are no longer checked in action for modularity reasons
- athletes: {Users} -- these roles are no longer checked in action for modularity reasons

Note: Role constraints are documented but not enforced here.

## Actions (Updated / Added)

Changed the requirements surrounding roles for the following actions: 
- createTeam(title, coach, passKey) → Team
- addAthlete(title, athlete, passKey)
- removeAthlete(title, athlete)

I added these actions for future ui promting about the team while the athlete may be on the team or the coach may be on the team
- getTeamByCoach(coachId) → Team
- getTeamByAthlete(athleteId) → Team
- getAthletesByTeam(teamId) → User[]
