---
timestamp: 'Fri Nov 07 2025 19:33:05 GMT-0500 (Eastern Standard Time)'
parent: '[[../20251107_193305.3f4a66b1.md]]'
content_id: b59c1727b8273fd2e7723c9ca58afc6748220c79678753a4628e952e4133c229
---

# prompt: How should I split up my paths:

ARNING - UNVERIFIED ROUTE: /api/CalanderEvent/getEvent
WARNING - UNVERIFIED ROUTE: /api/CalanderEvent/createEvent
WARNING - UNVERIFIED ROUTE: /api/CalanderEvent/deleteEvent
WARNING - UNVERIFIED ROUTE: /api/CalanderEvent/editEvent
WARNING - UNVERIFIED ROUTE: /api/CalanderEvent/duplicateEvent
WARNING - UNVERIFIED ROUTE: /api/CalanderEvent/getEventsByDate
WARNING - UNVERIFIED ROUTE: /api/Notification/create
WARNING - UNVERIFIED ROUTE: /api/Notification/addEvent
WARNING - UNVERIFIED ROUTE: /api/Notification/send
WARNING - UNVERIFIED ROUTE: /api/TeamMembership/createTeam
WARNING - UNVERIFIED ROUTE: /api/TeamMembership/addAthlete
WARNING - UNVERIFIED ROUTE: /api/TeamMembership/removeAthlete
WARNING - UNVERIFIED ROUTE: /api/TeamMembership/getTeamByCoach
WARNING - UNVERIFIED ROUTE: /api/TeamMembership/getTeamByAthlete
WARNING - UNVERIFIED ROUTE: /api/TeamMembership/getAthletesByTeam
WARNING - UNVERIFIED ROUTE: /api/TrainingRecords/logData
WARNING - UNVERIFIED ROUTE: /api/TrainingRecords/logDailyEntry
WARNING - UNVERIFIED ROUTE: /api/TrainingRecords/listEntries
WARNING - UNVERIFIED ROUTE: /api/TrainingRecords/createWeeklySummary
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/normalizeEmail
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/loginWithGoogleIdToken
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/getUser
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/loginWithGoogle
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/setName
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/setRole
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/setGender
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/setWeeklyMileage
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/getAthleteMileage
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/getAthletesByGender
WARNING - UNVERIFIED ROUTE: /api/UserDirectory/getUserRole
FIX: Please verify routes in: ./src/concepts/Requesting/passthrough.ts
/\*\*

* The Requesting concept exposes passthrough routes by default,
* which allow POSTs to the route:
*
* /{REQUESTING\_BASE\_URL}/{Concept name}/{action or query}
*
* to passthrough directly to the concept action or query.
* This is a convenient and natural way to expose concepts to
* the world, but should only be done intentionally for public
* actions and queries.
*
* This file allows you to explicitly set inclusions and exclusions
* for passthrough routes:
* * inclusions: those that you can justify their inclusion
* * exclusions: those to exclude, using Requesting routes instead
    \*/

/\*\*

* INCLUSIONS
*
* Each inclusion must include a justification for why you think
* the passthrough is appropriate (e.g. public query).
*
* inclusions = {"route": "justification"}
  \*/

export const inclusions: Record\<string, string> = {
// Feel free to delete these example inclusions
"/api/LikertSurvey/\_getSurveyQuestions": "this is a public query",
"/api/LikertSurvey/\_getSurveyResponses": "responses are public",
"/api/LikertSurvey/\_getRespondentAnswers": "answers are visible",
"/api/LikertSurvey/submitResponse": "allow anyone to submit response",
"/api/LikertSurvey/updateResponse": "allow anyone to update their response",
};

/\*\*

* EXCLUSIONS
*
* Excluded routes fall back to the Requesting concept, and will
* instead trigger the normal Requesting.request action. As this
* is the intended behavior, no justification is necessary.
*
* exclusions = \["route"]
  \*/

export const exclusions: Array<string> = \[
// Feel free to delete these example exclusions
"/api/LikertSurvey/createSurvey",
"/api/LikertSurvey/addQuestion",
];
