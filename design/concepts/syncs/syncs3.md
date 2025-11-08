[@syncs](./syncs2.md)
[@syncs](./syncs.md)

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
 /**
 * The Requesting concept exposes passthrough routes by default,
 * which allow POSTs to the route:
 *
 * /{REQUESTING_BASE_URL}/{Concept name}/{action or query}
 *
 * to passthrough directly to the concept action or query.
 * This is a convenient and natural way to expose concepts to
 * the world, but should only be done intentionally for public
 * actions and queries.
 *
 * This file allows you to explicitly set inclusions and exclusions
 * for passthrough routes:
 * - inclusions: those that you can justify their inclusion
 * - exclusions: those to exclude, using Requesting routes instead
 */

/**
 * INCLUSIONS
 *
 * Each inclusion must include a justification for why you think
 * the passthrough is appropriate (e.g. public query).
 *
 * inclusions = {"route": "justification"}
 */

export const inclusions: Record<string, string> = {
  // Feel free to delete these example inclusions
  "/api/LikertSurvey/_getSurveyQuestions": "this is a public query",
  "/api/LikertSurvey/_getSurveyResponses": "responses are public",
  "/api/LikertSurvey/_getRespondentAnswers": "answers are visible",
  "/api/LikertSurvey/submitResponse": "allow anyone to submit response",
  "/api/LikertSurvey/updateResponse": "allow anyone to update their response",
};

/**
 * EXCLUSIONS
 *
 * Excluded routes fall back to the Requesting concept, and will
 * instead trigger the normal Requesting.request action. As this
 * is the intended behavior, no justification is necessary.
 *
 * exclusions = ["route"]
 */

export const exclusions: Array<string> = [
  // Feel free to delete these example exclusions
  "/api/LikertSurvey/createSurvey",
  "/api/LikertSurvey/addQuestion",
];
# response:

Based on the principle of Concept Design emphasizing separation of concerns and relying on `syncs` for cross-concept behavior and authorization, it is generally safest to **exclude** any route that requires:

1.  **Authorization:** Checking user roles, ownership, or team membership.
2.  **Input Validation:** Beyond basic type checks, if logic for valid input is complex.
3.  **Side Effects/Cascading Logic:** Actions that trigger other actions or notifications in different concepts.
4.  **Internal Helper Functions:** Methods not intended for direct external API access.

Given the nature of your application (teams, coaches, athletes, sensitive data, notifications), almost every action and most queries will fall into one of these categories. The `syncs` you've designed explicitly demonstrate authorization checks for nearly all operations.

Therefore, the most secure and robust approach is to **exclude almost all of your routes** and let the `Requesting` concept and your `syncs` handle the flow, validation, and authorization.

### Revised `passthrough.ts` Structure

```typescript
// file: src/concepts/Requesting/passthrough.ts

/**
 * The Requesting concept exposes passthrough routes by default,
 * which allow POSTs to the route:
 *
 * /{REQUESTING_BASE_URL}/{Concept name}/{action or query}
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
 */

/**
 * INCLUSIONS
 *
 * Each inclusion must include a justification for why you think
 * the passthrough is appropriate (e.g. public query).
 *
 * For your application, it is highly recommended to have NO inclusions
 * at this stage, as almost all routes require specific authorization
 * and orchestration via syncs.
 */
export const inclusions: Record<string, string> = {
  // Keeping this empty is the safest approach for your current application design.
  // If you later identify a truly public, read-only endpoint that needs no auth,
  // you can add it here with strong justification.
};

/**
 * EXCLUSIONS
 *
 * Excluded routes fall back to the Requesting concept, and will
 * instead trigger the normal Requesting.request action. As this
 * is the intended behavior, no justification is necessary for
 * simply excluding them.
 */
export const exclusions: Array<string> = [
  // --- CalanderEvent Concept ---
  "/api/CalanderEvent/getEvent", // Access likely restricted to team members
  "/api/CalanderEvent/createEvent", // Coach only, team ownership
  "/api/CalanderEvent/deleteEvent", // Coach only, team ownership
  "/api/CalanderEvent/editEvent", // Coach only, team ownership
  "/api/CalanderEvent/duplicateEvent", // Coach only, team ownership
  "/api/CalanderEvent/getEventsByDate", // Access likely restricted to team members

  // --- Notification Concept ---
  "/api/Notification/create", // Coach only
  "/api/Notification/addEvent", // Coach only
  "/api/Notification/send", // Coach only (or system trigger via sync)

  // --- TeamMembership Concept ---
  "/api/TeamMembership/createTeam", // Coach only
  "/api/TeamMembership/addAthlete", // Coach adds, or Athlete joins with passkey
  "/api/TeamMembership/removeAthlete", // Coach removes, or Athlete leaves
  "/api/TeamMembership/getTeamByCoach", // Restricted to the coach themselves
  "/api/TeamMembership/getTeamByAthlete", // Restricted to the athlete themselves
  "/api/TeamMembership/getAthletesByTeam", // Restricted to coach/team members

  // --- TrainingRecords Concept ---
  "/api/TrainingRecords/logData", // Internal helper, not a direct API endpoint
  "/api/TrainingRecords/logDailyEntry", // Athlete only (for self)
  "/api/TrainingRecords/listEntries", // Athlete only (for self), Coach (for team members)
  "/api/TrainingRecords/createWeeklySummary", // Coach only (for athletes)

  // --- UserDirectory Concept ---
  "/api/UserDirectory/normalizeEmail", // Internal helper, not a direct API endpoint
  "/api/UserDirectory/loginWithGoogleIdToken", // Entry point for authentication, syncs handle session/token creation
  "/api/UserDirectory/getUser", // Access restricted (self, or coach for team members)
  "/api/UserDirectory/loginWithGoogle", // Internal helper, used by loginWithGoogleIdToken
  "/api/UserDirectory/setName", // User only (for self)
  "/api/UserDirectory/setRole", // Admin/system only (or initial registration)
  "/api/UserDirectory/setGender", // User only (for self)
  "/api/UserDirectory/setWeeklyMileage", // Athlete only (for self), Coach (for team members)
  "/api/UserDirectory/getAthleteMileage", // Athlete only (for self), Coach (for team members)
  "/api/UserDirectory/getAthletesByGender", // Coach only (or admin)
  "/api/UserDirectory/getUserRole", // User only (for self), Coach (for team members)
];
```

### Justification for this approach:

*   **Security by Default:** By excluding nearly everything, you ensure that no action can be performed without first passing through your `Requesting` concept and the associated `syncs`. This prevents unauthorized access to mutations and sensitive data queries.
*   **Centralized Authorization Logic:** All role and relationship-based authorization is handled in your `syncs`, making it easier to audit and maintain.
*   **Orchestration:** Complex workflows (like creating an event and automatically sending a notification) are naturally expressed and managed by `syncs`, rather than being embedded within concept implementations or handled by external controllers.
*   **Clear API Contract:** The `Requesting` concept acts as the single point of entry for user-initiated operations, making the application's external API explicit and consistent.