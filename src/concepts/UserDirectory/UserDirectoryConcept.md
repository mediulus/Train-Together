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
                    an accountPassword String
                    weeklyMileage: Number | null //athletes have mileage while coaches do not
                    gender: Enum{female, male}

            actions:
                register(email: String, name: String, password: String, role: Enum, gender: Enum): (user: User)
                    requires: no user exists with that email
                    effects: creates a new User model with email = email, name = name, role = role, and accountPassword = password, unique id is matched to the users id, gende= gender

                setWeeklyMileage(user_id: ID, weeklyMileage: Number)
                    requires: User exists with that user_id and has role = athlete
                    effects: user.weeklyMileage = weeklyMileage

                getWeeklyMileage(user_id): (weeklyMileage: Number)
                  requires: User exists and user.role == Athlete
                  effects: returns the users weeklyMileage

                getAthleteByGender(gender: Enum): User[]
                  requires: there are athletes and athletes with that gender
                  effects: returns the athletes with that gender

## Changes from Assignment 2:

1. Added an "id" for the user state for help with uniqueness
2. Added "gender" to the user state for a later sync where the coach may prompt to get certain athletes by gender
3. set/got user information based on the id rather than the email since the application will be able to prompt and grab the id easier than the users email
4. Added the getWeeklyMileage action for a future sync with the TrainingRecords concept for when the coach logs users mileage
5. Added the getAtheleteByGender action so that the coach can filter athlete information when logging or browsing

