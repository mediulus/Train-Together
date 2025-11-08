---
timestamp: 'Fri Nov 07 2025 19:33:05 GMT-0500 (Eastern Standard Time)'
parent: '[[../20251107_193305.3f4a66b1.md]]'
content_id: 7aecab9c757a88ddf1cd4f4d17dc132a8829935a473efca279c0aee97385c0b0
---

# prompt: How can i do this based on these syncs:

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

* Sample synchronizations: feel free to delete this entire file!
  \*/

import {Requesting } from "@concepts";
import { actions, Sync } from "@engine";

export {}
// const CreateSurveyRequest: Sync = (
//   { request, author, title, scaleMin, scaleMax },
// ) => ({
//   when: actions(\[
//     Requesting.request,
//     { path: "/LikertSurvey/createSurvey", author, title, scaleMin, scaleMax },
//     { request },
//   ]),
//   then: actions(\[LikertSurvey.createSurvey, {
//     author,
//     title,
//     scaleMin,
//     scaleMax,
//   }]),
// });

// export const CreateSurveyResponse: Sync = ({ request, survey }) => ({
//   when: actions(
//     \[Requesting.request, { path: "/LikertSurvey/createSurvey" }, { request }],
//     \[LikertSurvey.createSurvey, {}, { survey }],
//   ),
//   then: actions(\[Requesting.respond, { request, survey }]),
// });

// export const AddQuestionRequest: Sync = ({ request, survey, text }) => ({
//   when: actions(\[
//     Requesting.request,
//     { path: "/LikertSurvey/addQuestion", survey, text },
//     { request },
//   ]),
//   then: actions(\[LikertSurvey.addQuestion, { survey, text }]),
// });

// export const AddQuestionResponse: Sync = ({ request, question }) => ({
//   when: actions(
//     \[Requesting.request, { path: "/LikertSurvey/addQuestion" }, { request }],
//     \[LikertSurvey.addQuestion, {}, { question }],
//   ),
//   then: actions(\[Requesting.respond, { request, question }]),
// });
