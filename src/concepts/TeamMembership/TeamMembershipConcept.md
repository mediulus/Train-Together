## Concept
      concept TeamMembership:
          purpose: Organize teams and their membership so coaches can create teams and athletes can join them.
          principle: After a coach creates a team with a unique name and passKey, athletes who know the passKey can join the team and remain members until they leave.

          state:
              a set of Teams with:
                  an id: ID
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


## Changes from Assignment 2
1. Added an id attribute to the Team for easier access and a unique identifier
2. added action getTeamByCoach so that when a coach is on the application, it can identify the team they are a part of with their userId
3. added action getTeamByAthlete so that when an athlete is on the application, it can identify the team they are a part of with their userId
4. added action getAthletesByTeam, so that when the coach is looking at the dashboard or adding to a trianing log they can access their athletes easily