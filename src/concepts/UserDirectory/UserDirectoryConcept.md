## Concept

    concept UserDirectory
            purpose: Register and manage users of the system with unique emails and roles.
            principle: After a user registers with a role, they can be referenced by other concepts.

            state:
                a set of Users with:
                    a id ID
                    a name String
                    an email String
                    a role Enum{coach, athlete}
                    weeklyMileage: Number | null //athletes have mileage while coaches do not
                    gender: Enum{female, male}
                    google {sub: string, email: string, emailVerified: Boolean, name:string} | null
                    primaryAuth: string
                    lastLoginAt: Date

                
            actions:
                loginWithGoogleIdToken(idToken: string): userID: ID, needsName: boolean, needsRole: boolean
                    requires: valid google idToken 
                    effects: generates a new/returning user and asserts whether or not they need a role or name
                
                setName(userId: ID, name: String)
                    requires: user exists with that userID
                    effects: user.name = name

                setRole(userId: ID, role: Enum{'athlete', 'coach;})
                    requires: user exists with that userID
                    effects: user.role = role

                setGender(userId: ID, gender: Enum{'male'|'female'})
                    requires: user exists with that userID
                    effects: user.gender = gender

                setWeeklyMileage(user_id: ID, weeklyMileage: Number)
                    requires: User exists with that user_id and has role = athlete
                    effects: user.weeklyMileage = weeklyMileage

                getWeeklyMileage(user_id): (weeklyMileage: Number)
                  requires: User exists and user.role == Athlete
                  effects: returns the users weeklyMileage

                getAthletesByGender(gender: Enum): User[]
                  requires: there are athletes and athletes with that gender
                  effects: returns the athletes with that gender

                getUserRole(userId: ID): Enum {'athlete', 'coach'}
                    requires: users exists with that userId
                    effects: returns the role of the user

