While updating this concept I focused on actions that simplify frontend work—especially the coach's view when they want to see their athletes.

To make common UI flows easier, I added the following actions (with intended behavior):

- getTeamByCoach — return the team coached by a given coach ID.
- getTeamByAthlete — return the team an athlete belongs to (lookup by athlete ID).
- getAthletesByTeam — return the list of athlete IDs for a given team (lookup by team ID).

I also added a dedicated team ID (_id) to the team state so lookups are stable and safe even if a team's name changes.

UPDATES:
I also adapted the requirements to not care about the roke of the users so that the concepts remained seperate