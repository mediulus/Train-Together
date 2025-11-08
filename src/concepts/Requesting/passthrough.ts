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
  "/api/CalanderEvent/getEvent": "this is a public query",
  "/api/CalanderEvent/getEventsByDate": "this is a public query",
  "/api/TeamMembership/getTeamByCoach": "this is a public query",
  "/api/TeamMembership/getTeamByAthlete": "this is a public query",
  "/api/TeamMembership/getAthletesByTeam": "this is a public query",
  "/api/TrainingRecords/logData": "this is a public action",
  "/api/TrainingRecords/logDailyEntry": "this is a public action",
  "/api/TrainingRecords/listEntries": "this is a public query",
  "/api/TrainingRecords/createWeeklySummary": "this is a public action",
  "/api/UserDirectory/normalizeEmail": "this is a public query",
  "/api/UserDirectory/loginWithGoogleIdToken": "this is a public action",
  "/api/UserDirectory/getUser": "this is a public query",
  "/api/UserDirectory/loginWithGoogle": "this is a public action",
  "/api/UserDirectory/setName": "this is a public action",
  "/api/UserDirectory/setGender": "this is a public action",
  "/api/UserDirectory/getAthleteMileage": "this is a public query",

  "/api/UserDirectory/getUserRole": "this is a public query",
  "/api/Notification/ensureGmail": "this is a public action",
  "/api/TrainingRecords/getTeamWeeklySummaries": "this is a public query",
  "/api/Notification/base64UrlEncode": "this is a public action",
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
  "/api/TeamMembership/createTeam",
  "/api/TeamMembership/deleteTeam",
  "/api/TeamMembership/removeAthlete",
  "/api/TeamMembership/addAthlete",

  "/api/CalanderEvent/deleteEvent",
  "/api/CalanderEvent/createEvent",
  "/api/CalanderEvent/editEvent",

  "/api/UserDirectory/setWeeklyMileage",
  "/api/UserDirectory/setRole",

  "/api/Notification/create",
  "/api/Notification/send",
  "/api/Notification/composeHtmlEmail",
];
