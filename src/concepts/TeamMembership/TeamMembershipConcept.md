## Concept
      concept TeamMembership:
          purpose: Organize teams and their membership so coaches can create teams and athletes can join them.
          principle: After a coach creates a team with a unique name and passKey, athletes who know the passKey can join the team and remain members until they leave.

          state:
              a set of Teams with:
                  an id: ID
                  a name String
                  a passKey
                  a coach User 
                  athletes {Users}

          actions:
                createTeam(title: String, coach: User, passKey: String): (newTeam: Team)
                    requires: 
                        - no team with this name exists
                        - this coach does not coach another team
                    effects: generates a new team object with name = title, coach = coach, passKey = passKey

                addAthlete(title: String, athlete?: User, athleteId?: ID, passkey: String)
                    requires: 
                        - Team exists with this title
                        - passKey = team.passKey
                        - athlete is not already a member of this team
                    effects: adds the athlete to the team.athletes set

                removeAthlete(title: String, athlete?: User, athleteId?: ID)
                    requires: 
                        - Team exists with this title
                        - user is in team.athletes
                    effects: removes the athlete with that name from the team.athletes set

                getTeamByCoach(coachId: ID): coachesTeam: Team
                    requires: the coach has a team
                    effects: returns the team the coach owns 

                getTeamByAthlete(athleteId: ID): athletesTeam: Team
                    requires: the athlete has a team
                    effects: returns the team the athlete is a part of 

                getAthletesByTeam(teamId): Athlete[]
                    requires: the team exists
                    effects: returns a list of the athletes in that team

                deleteTeam(title: string, coachID?: ID, coach?: User)
                    requires: 
                        - team with name exists
                        - requesting coach owns the team
                    effects: deletes the team document

