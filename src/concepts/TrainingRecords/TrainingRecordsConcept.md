    concept TrainingRecords [User]:
        purpose: Record athlete data, compute week-over-week summaries, and—using AI— generate short, factual notes summarizing how an athlete appears to be responding to training. (All data originates from a Google Sheet import; the AI reads the derived weekly summaries.)

        principle:  Maintain canonical daily records and derive weekly summaries that power the dashboard. Any automation (e.g., AI notes, reminders) reads from these summaries and produces separate, reviewable outputs

        state:

            a set of AthleteData with
                a athleteID: User
                a day Date
                a mileage number
                a stress number
                a sleep number
                a restingHeartRate number
                an excerciseHeartRate number
                a perceivedExertion number
                a notes String

            a set of Comparisons with
              an activityMetric Number
              a trendDirections Enum{up,down,flat}
            
            a WeeklySummary with
                an athleteId User
                a weekStart Date
                a mileageSoFar Number
                an averageStress Comparison
                an averageSleep Comparison
                an averageRestingHeartRate Comparison
                an averageExerciseHeartRate Comparison
                an averagePerceivedExertion Comparison
                an athleteDataDailyCollection {AthleteData}
            
        actions:
            actions:
              createWeeklySummary(athlete: User, todaysDate: Date): WeeklySummary
                requires: athlete exists, and athelt e has role = athlete, requester exists and is a coach, caoch and athlete are on same team
                effects: uses todaysDate to find the week sunday-saturday that the week falls in and acquires all of the athletes datas from that week and the week prior and calculates averages and changes from the previous week and generates a weekly summary 
              
              logData(date: Date, athlete: User, loggValues...): AthleteData
                requires: 
                  - all log values are valid keys
                  - athlete exists
                  - athlete has role = athlete
                effects: edits or logs an athlete's data from that day with the corresponding log values