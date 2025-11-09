## Concept

    concept UserDirectory
            purpose: Register and manage users of the system with unique emails and roles.
            principle: When a new user logs on they will be prompted to log in with google. Once their account has been created, they will define their role as an athlete or a coach. If they are a coach there account will be created and they will move on, while athletes will be prompted to set certain attributes about themselves like their mileage, and gender. Additionally, if a coach wanted to get information about athletes, they could prompt to find all athletes of a certain gender or get an athletes weekly mileage.
            
            state:
                a set of Users with:
                    a id ID
                    a name String
                    an email String
                    a role Enum{coach, athlete}
                    weeklyMileage: Number | null 
                    gender: Enum{female, male}
                    google {sub: string, email: string, emailVerified: Boolean, name:string} | null
                    primaryAuth: string
                    lastLoginAt: Date

                
            actions:
                loginWithGoogleIdToken(idToken: string): userID: ID, needsName: boolean, needsRole: boolean
                    requires: valid google idToken 
                    effects: generates a new/returning user and asserts whether or not they need a role or name
                
                getUser(userId: ID): user: User
                    requires: User exists
                    effects: returns thte user

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

                getAthleteMileage(user_id): (weeklyMileage: Number)
                  requires: User exists and user.role == Athlete
                  effects: returns the users weeklyMileage

                getUserRole(userId: ID): Enum {'athlete', 'coach'}
                    requires: users exists with that userId
                    effects: returns the role of the user

