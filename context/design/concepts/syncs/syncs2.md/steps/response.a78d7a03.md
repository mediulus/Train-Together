---
timestamp: 'Fri Nov 07 2025 19:31:31 GMT-0500 (Eastern Standard Time)'
parent: '[[../20251107_193131.63be549f.md]]'
content_id: a78d7a03f461751065884576298f23cb057498685ca6dfa7f23d9ce68c34ab8c
---

# response:

```typescript
import { Requesting } from "@concepts";
import CalanderEventConcept, { Event } from "@concepts/CalanderEvent/CalanderEventConcept.ts";
import NotificationsConcept, { NotificationDoc } from "@concepts/Notification/NotificationsConcept.ts";
import TeamMembershipConcept, { Team, TeamID } from "@concepts/TeamMembership/TeamMembershipConcept.ts";
import TrainingRecordsConcept, { WeeklySummary } from "@concepts/TrainingRecords/TrainingRecordsConcept.ts";
import UserDirectoryConcept, {
  Role,
  User,
  UserID,
} from "@concepts/UserDirectory/UserDirectoryConcept.ts";
import { actions, Sync } from "@engine";
import { ID, Empty } from "@utils/types.ts";

// --- Helper for fetching full User objects and checking roles ---
// This function helps build the 'when' clause for requests that require user authentication and role checking.
// It assumes that `Requesting.request` provides the `requestingUser` ID.
function getUserAndRoleWhen(
  path: string, // The API path being requested
  requestingUser: UserID, // The ID of the user making the request
  requiredRole?: Role, // An optional role to check against
) {
  const blocks: any[] = [
    // Fetch the full User object for the requesting user
    actions(
      [UserDirectoryConcept.getUser, { userId: requestingUser }, { user: "requesting_user_obj" }],
    ),
    // Fetch the role of the requesting user
    actions(
      [UserDirectoryConcept.getUserRole, { userId: requestingUser }, { role: "requesting_user_role" }],
    ),
  ];

  // If a specific role is required, we can add a check here.
  // In a robust sync engine, this would be a 'where' clause that filters the sync.
  // For the `actions` structure, it implies `requesting_user_role` must match `requiredRole`
  // for subsequent `then` actions to fire correctly, or the `then` action itself validates.
  if (requiredRole) {
    blocks.push(
      // This is a direct check in the 'when' phase. If `requesting_user_role` does not match `requiredRole`,
      // this action (and thus the sync) would conceptually not match.
      actions(
        [UserDirectoryConcept.getUserRole, { userId: requestingUser }, { role: requiredRole }],
      ),
    );
  }
  return blocks;
}

// --- Sync Definitions ---

// --- 1. Authentication and Authorization Syncs ---

// Authorization for Coach actions on TeamMembership
export const AuthorizeCoachCreateTeam: Sync = (
  { request, title, passKey, requestingUser, requesting_user_obj, requesting_user_role },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/TeamMembership/createTeam", title, passKey, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/TeamMembership/createTeam", requestingUser, Role.Coach),
    // Ensure the coach does not already coach another team (pre-condition of createTeam)
    // The `createTeam` action itself handles this check and returns an error.
  ],
  then: actions(
    [
      TeamMembershipConcept.createTeam,
      { title, coach: requesting_user_obj, passKey },
      { newTeam: "new_team_obj" },
    ],
    [Requesting.respond, { request, newTeam: "new_team_obj" }],
  ),
});

export const AuthorizeCoachAddAthleteToTeam: Sync = (
  { request, title, athleteId, passKey, requestingUser, requesting_user_obj, requesting_user_role, athlete_obj, team_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/TeamMembership/addAthlete", title, athleteId, passKey, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/TeamMembership/addAthlete", requestingUser, Role.Coach),
    actions(
      [UserDirectoryConcept.getUser, { userId: athleteId }, { user: "athlete_obj" }], // Fetch full athlete object
    ),
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: requesting_user_obj }, { team: "team_obj" }], // Get the team coached by the requesting user
    ),
    // Implicit 'where': team_obj.name must match 'title'. The `addAthlete` concept action should verify this.
  ],
  then: actions(
    [TeamMembershipConcept.addAthlete, { title, athlete: athlete_obj, passKey }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

export const AuthorizeCoachRemoveAthleteFromTeam: Sync = (
  { request, title, athleteId, requestingUser, requesting_user_obj, requesting_user_role, athlete_obj, team_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/TeamMembership/removeAthlete", title, athleteId, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/TeamMembership/removeAthlete", requestingUser, Role.Coach),
    actions(
      [UserDirectoryConcept.getUser, { userId: athleteId }, { user: "athlete_obj" }], // Fetch full athlete object
    ),
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: requesting_user_obj }, { team: "team_obj" }], // Get the team coached by the requesting user
    ),
    // Implicit 'where': team_obj.name must match 'title'. The `removeAthlete` concept action should verify this.
  ],
  then: actions(
    [TeamMembershipConcept.removeAthlete, { title, athlete: athlete_obj }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

// Authorization for Coach actions on CalendarEvent
export const AuthorizeCoachCreateCalendarEvent: Sync = (
  { request, teamId, startTime, endTime, location, title, description, link, requestingUser, requesting_user_obj, requesting_user_role, team_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/CalanderEvent/createEvent", teamId, startTime, endTime, location, title, description, link, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/CalanderEvent/createEvent", requestingUser, Role.Coach),
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: requesting_user_obj }, { team: "team_obj" }], // Verify coach coaches *a* team
    ),
    // Implicit 'where': team_obj._id must match 'teamId'. The `createEvent` action must ensure the requesting coach coaches THIS team.
  ],
  then: actions(
    [
      CalanderEventConcept.createEvent,
      { teamId, startTime, endTime, location, title, description, link },
      { event: "new_event_id" },
    ],
    [Requesting.respond, { request, event: "new_event_id" }],
  ),
});

export const AuthorizeCoachEditCalendarEvent: Sync = (
  { request, eventId, updates, requestingUser, requesting_user_obj, requesting_user_role, event_obj, team_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/CalanderEvent/editEvent", eventId, updates, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/CalanderEvent/editEvent", requestingUser, Role.Coach),
    actions(
      [CalanderEventConcept.getEvent, { eventId }, { event: "event_obj" }], // Fetch the event to get its teamId
    ),
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: requesting_user_obj }, { team: "team_obj" }], // Verify coach coaches *a* team
    ),
    // Implicit 'where': team_obj._id must match event_obj.teamId. The `editEvent` action must ensure the coach coaches THIS event's team.
  ],
  then: actions(
    [CalanderEventConcept.editEvent, { event: eventId, updates }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

export const AuthorizeCoachDeleteCalendarEvent: Sync = (
  { request, eventId, requestingUser, requesting_user_obj, requesting_user_role, event_obj, team_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/CalanderEvent/deleteEvent", eventId, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/CalanderEvent/deleteEvent", requestingUser, Role.Coach),
    actions(
      [CalanderEventConcept.getEvent, { eventId }, { event: "event_obj" }], // Fetch the event BEFORE deletion for authorization
    ),
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: requesting_user_obj }, { team: "team_obj" }], // Verify coach coaches *a* team
    ),
    // Implicit 'where': team_obj._id must match event_obj.teamId. The `deleteEvent` action must ensure the coach coaches THIS event's team.
  ],
  then: actions(
    [CalanderEventConcept.deleteEvent, { event: eventId }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

export const AuthorizeCoachDuplicateCalendarEvent: Sync = (
  { request, eventId, requestingUser, requesting_user_obj, requesting_user_role, event_obj, team_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/CalanderEvent/duplicateEvent", eventId, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/CalanderEvent/duplicateEvent", requestingUser, Role.Coach),
    actions(
      [CalanderEventConcept.getEvent, { eventId }, { event: "event_obj" }], // Fetch the event for authorization
    ),
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: requesting_user_obj }, { team: "team_obj" }], // Verify coach coaches *a* team
    ),
    // Implicit 'where': team_obj._id must match event_obj.teamId. The `duplicateEvent` action must ensure the coach coaches THIS event's team.
  ],
  then: actions(
    [CalanderEventConcept.duplicateEvent, { event: eventId }, { duplicateEvent: "new_event_id" }],
    [Requesting.respond, { request, duplicateEvent: "new_event_id" }],
  ),
});

// Authorization for Coach actions on Notifications
export const AuthorizeCoachCreateNotification: Sync = (
  { request, senderId, recipientsIds, eventsIds, additionalMessage, scheduledAt, requestingUser, requesting_user_obj, requesting_user_role },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/Notification/create", senderId, recipientsIds, eventsIds, additionalMessage, scheduledAt, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/Notification/create", requestingUser, Role.Coach),
    // Implicit 'where': senderId must be requestingUser. The `create` action itself should verify this.
    // Gaps: Notifications.create expects User[] and Event[] but only gets IDs. Assume concept handles internal resolution.
  ],
  then: actions(
    [
      NotificationsConcept.create,
      {
        sender: requesting_user_obj, // The sender is the requesting coach
        recipients: recipientsIds, // Assuming concept resolves UserID[] to User[]
        events: eventsIds, // Assuming concept resolves EventID[] to Event[]
        additionalMessage,
        scheduledAt,
      },
      { id: "new_notification_id" },
    ],
    [Requesting.respond, { request, id: "new_notification_id" }],
  ),
});

export const AuthorizeCoachAddEventToNotification: Sync = (
  { request, editorId, eventId, notificationId, requestingUser, requesting_user_obj, requesting_user_role, event_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/Notification/addEvent", editorId, eventId, notificationId, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/Notification/addEvent", requestingUser, Role.Coach),
    actions(
      [CalanderEventConcept.getEvent, { eventId }, { event: "event_obj" }], // Fetch the event object
    ),
    // Implicit 'where': editorId must be requestingUser AND requesting_user_obj must be the sender of notificationId.
    // The `addEvent` action within NotificationsConcept verifies this.
  ],
  then: actions(
    [NotificationsConcept.addEvent, { editor: requesting_user_obj, event: event_obj, notification: notificationId }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

// Authorization for Coach actions on TrainingRecords
export const AuthorizeCoachCreateWeeklySummaryForAthlete: Sync = (
  { request, athleteId, todaysDate, requestingUser, requesting_user_obj, requesting_user_role, athlete_obj, athlete_role },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/TrainingRecords/createWeeklySummary", athleteId, todaysDate, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/TrainingRecords/createWeeklySummary", requestingUser, Role.Coach),
    actions(
      [UserDirectoryConcept.getUser, { userId: athleteId }, { user: "athlete_obj" }], // Fetch the athlete object
    ),
    actions(
      [UserDirectoryConcept.getUserRole, { userId: athleteId }, { role: Role.Athlete }], // Verify the target is an athlete
    ),
    // Optional: Add check for coach being coach of the athlete's team (requires `TeamMembership.getTeamsByAthlete` and cross-check)
  ],
  then: actions(
    [
      TrainingRecordsConcept.createWeeklySummary,
      { athlete: athlete_obj, todaysDate },
      { summary: "weekly_summary_obj" },
    ],
    [Requesting.respond, { request, summary: "weekly_summary_obj" }],
  ),
});

// 1.2 Athlete-Specific Actions

export const AuthorizeAthleteJoinTeam: Sync = (
  { request, title, athleteId, passKey, requestingUser, requesting_user_obj, requesting_user_role },
) => ({
  when: [
    // This route should ideally be /api/TeamMembership/joinTeam, but using addAthlete as a proxy.
    actions(
      [Requesting.request, { path: "/api/TeamMembership/addAthlete", title, athleteId, passKey, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/TeamMembership/addAthlete", requestingUser, Role.Athlete),
    // Implicit 'where': athleteId must match requestingUser. The `addAthlete` action itself handles this implicitly
    // by using `requesting_user_obj` as the athlete to add.
  ],
  then: actions(
    [TeamMembershipConcept.addAthlete, { title, athlete: requesting_user_obj, passKey }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

export const AuthorizeAthleteLeaveTeam: Sync = (
  { request, title, athleteId, requestingUser, requesting_user_obj, requesting_user_role, team_obj },
) => ({
  when: [
    // This route should ideally be /api/TeamMembership/leaveTeam, but using removeAthlete as a proxy.
    actions(
      [Requesting.request, { path: "/api/TeamMembership/removeAthlete", title, athleteId, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/TeamMembership/removeAthlete", requestingUser, Role.Athlete),
    actions(
      [TeamMembershipConcept.getTeamByAthlete, { athleteId: requesting_user_obj }, { team: "team_obj" }], // Verify athlete is on *a* team
    ),
    // Implicit 'where': athleteId must match requestingUser AND team_obj.name must match 'title'.
    // The `removeAthlete` action within TeamMembershipConcept verifies the athlete is part of THIS team.
  ],
  then: actions(
    [TeamMembershipConcept.removeAthlete, { title, athlete: requesting_user_obj }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

export const AuthorizeAthleteLogDailyEntry: Sync = (
  { request, userId, date, mileage, stress, sleep, restingHeartRate, exerciseHeartRate, perceivedExertion, notes, requestingUser, requesting_user_obj, requesting_user_role },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/TrainingRecords/logDailyEntry", userId, date, mileage, stress, sleep, restingHeartRate, exerciseHeartRate, perceivedExertion, notes, requestingUser }, { request }],
    ),
    ...getUserAndRoleWhen("/api/TrainingRecords/logDailyEntry", requestingUser, Role.Athlete),
    // Implicit 'where': userId must match requestingUser. The `logDailyEntry` concept action handles this verification.
  ],
  then: actions(
    [
      TrainingRecordsConcept.logDailyEntry,
      { userId: requestingUser, date, mileage, stress, sleep, restingHeartRate, exerciseHeartRate, perceivedExertion, notes },
      { entry: "athlete_data_entry" },
    ],
    [Requesting.respond, { request, entry: "athlete_data_entry" }],
  ),
});

// --- 2. Calendar Event Notification Syncs ---

export const AutoCreateAndSendNotificationForNewEvent: Sync = (
  { new_event_id, full_event_obj, full_team_obj, new_notification_id },
) => ({
  when: [
    // Trigger when a new event is successfully created and its ID is returned.
    actions(
      [CalanderEventConcept.createEvent, {}, { event: "new_event_id" }],
    ),
    // Fetch the full event object using its ID.
    actions(
      [CalanderEventConcept.getEvent, { eventId: new_event_id }, { event: "full_event_obj" }],
    ),
    // Gaps: TeamMembershipConcept.getTeamById(teamId: ID) is missing. Using getTeamByAthlete with a hack for now.
    // Ideally, TeamMembershipConcept should have `_getTeamById` or similar.
    // Assuming `full_event_obj.teamId` gives us the team ID to fetch the full team.
    // Let's assume there's a hypothetical `TeamMembershipConcept._getTeamById` for cleaner resolution.
    // For now, I'll use `getTeamByAthlete` after fetching athletes, which is indirect.
    actions(
      [TeamMembershipConcept.getAthletesByTeam, { teamId: full_event_obj.teamId }, { athletes: "athletes_of_team" }],
    ),
    // If there are no athletes, we can't use getTeamByAthlete. This sync might not fire.
    // A robust system would require `TeamMembershipConcept._getTeamById`.
    // For this example, I'll hardcode a way to get the team's coach if no athletes, or assume at least one.
    // A more direct way to get the full `Team` object (including coach) by `teamId`.
    // Let's assume a simplified `_getTeamById` query on TeamMembershipConcept
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: (full_event_obj as Event).teamId }, { team: "full_team_obj" }], // This is incorrect, teamId is not coachId. Placeholder for a missing `_getTeamById` query.
      // Re-evaluating: getTeamByCoach requires a User. Let's assume `TeamMembershipConcept.getTeamByTeamId` exists.
      // Or, `TeamMembershipConcept.getAthletesByTeam` should be `TeamMembershipConcept.getTeamDetailsByTeamId`.
      // For now, as a placeholder, let's pass `full_event_obj.teamId` to `Notifications.create` and assume it resolves.
    ),
  ],
  then: actions(
    [
      NotificationsConcept.create,
      {
        sender: (full_team_obj as Team).coach, // Placeholder for actual coach. Needs `_getTeamById`
        recipients: (full_team_obj as Team).athletes, // Placeholder for actual athletes. Needs `_getTeamById`
        events: [full_event_obj],
        additionalMessage: "A new team event has been posted. See details below.",
        scheduledAt: new Date(),
      },
      { id: "new_notification_id" },
    ],
    [NotificationsConcept.send, { notification: new_notification_id }],
  ),
});

export const AutoCreateAndSendNotificationForEditedEvent: Sync = (
  { eventId, edited_event_obj, full_team_obj, new_notification_id },
) => ({
  when: [
    // Trigger when an event is successfully edited.
    // The `editEvent` action returns `Empty`, so we need to capture the `eventId` from the request that triggered it.
    // Assuming the sync engine can pass the `eventId` from `AuthorizeCoachEditCalendarEvent`'s `then` clause.
    // Or, for simplicity, we assume `eventId` is a variable available here.
    actions(
      [CalanderEventConcept.editEvent, { event: "eventId" }, {}], // `editEvent` returns Empty. `eventId` is the input parameter.
    ),
    actions(
      [CalanderEventConcept.getEvent, { eventId }, { event: "edited_event_obj" }], // Fetch the *updated* event object
    ),
    // Similar `TeamMembership` resolution gap as above.
    actions(
      [TeamMembershipConcept.getAthletesByTeam, { teamId: edited_event_obj.teamId }, { athletes: "athletes_of_team" }],
    ),
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: (edited_event_obj as Event).teamId }, { team: "full_team_obj" }], // Placeholder for `_getTeamById`
    ),
  ],
  then: actions(
    [
      NotificationsConcept.create,
      {
        sender: (full_team_obj as Team).coach, // Placeholder
        recipients: (full_team_obj as Team).athletes, // Placeholder
        events: [edited_event_obj],
        additionalMessage: "A team event has been updated. See new details below.",
        scheduledAt: new Date(),
      },
      { id: "new_notification_id" },
    ],
    [NotificationsConcept.send, { notification: new_notification_id }],
  ),
});

export const AutoCreateAndSendNotificationForDeletedEvent: Sync = (
  { eventId, deleted_event_obj, full_team_obj, new_notification_id },
) => ({
  when: [
    // Trigger when an event is successfully deleted.
    // Gaps: `CalanderEventConcept.deleteEvent` returns `Empty`.
    // For this sync to work reliably and include event details, `deleteEvent` should return the deleted `Event` object.
    // Assuming `deleteEvent` is modified to return `{ deletedEvent: Event }`.
    actions(
      [CalanderEventConcept.deleteEvent, { event: "eventId" }, { deletedEvent: "deleted_event_obj" }],
    ),
    // Similar `TeamMembership` resolution gap as above.
    actions(
      [TeamMembershipConcept.getAthletesByTeam, { teamId: deleted_event_obj.teamId }, { athletes: "athletes_of_team" }],
    ),
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: (deleted_event_obj as Event).teamId }, { team: "full_team_obj" }], // Placeholder for `_getTeamById`
    ),
  ],
  then: actions(
    [
      NotificationsConcept.create,
      {
        sender: (full_team_obj as Team).coach, // Placeholder
        recipients: (full_team_obj as Team).athletes, // Placeholder
        events: [],
        additionalMessage: `The team event "${deleted_event_obj.title}" has been deleted.`,
        scheduledAt: new Date(),
      },
      { id: "new_notification_id" },
    ],
    [NotificationsConcept.send, { notification: new_notification_id }],
  ),
});

// --- 3. Training Data Aggregation Sync ---

export const UpdateUserWeeklyMileageAfterSummary: Sync = (
  { athlete, todaysDate, weekly_summary_obj, athlete_user_in_dir },
) => ({
  when: [
    actions(
      [TrainingRecordsConcept.createWeeklySummary, { athlete, todaysDate }, { summary: "weekly_summary_obj" }],
    ),
    // Need to re-fetch the User object from UserDirectory, as `athlete` is the User object passed to TrainingRecords.
    actions(
      [UserDirectoryConcept.getUser, { userId: athlete._id }, { user: "athlete_user_in_dir" }],
    ),
  ],
  then: actions(
    [UserDirectoryConcept.setWeeklyMileage, { user_id: athlete_user_in_dir._id, weeklyMileage: weekly_summary_obj.mileageSoFar }],
  ),
});

// --- 4. Role Change Impact Syncs ---

// Gaps: These syncs require accessing the *previous* state of a user's role before `setRole` completes.
// This is typically achieved by `UserDirectoryConcept.setRole` returning the `oldRole`
// or a transactional/pre-action hook in the sync engine.
// Assuming `UserDirectoryConcept.setRole` is modified to return `{ newRole: Role, oldRole: Role | null }`.

export const RemoveAthleteFromTeamsIfRoleChangesFromAthlete: Sync = (
  { request, userId, role: new_role, set_role_output, user_obj_before_change, team_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/UserDirectory/setRole", userId, role: new_role }, { request }],
    ),
    actions(
      [UserDirectoryConcept.getUser, { userId }, { user: "user_obj_before_change" }], // Get user BEFORE role change
    ),
    actions(
      [UserDirectoryConcept.setRole, { userId, role: new_role }, { newRole: new_role, oldRole: "old_role_val" }], // Assume setRole returns oldRole
    ),
    // Conditional logic: only fire if old role was Athlete and new role is not Athlete
    // This requires a `where` clause capability from the sync engine.
    // Assuming `old_role_val === Role.Athlete && new_role !== Role.Athlete` as an implicit filter.
    // Gaps: `TeamMembershipConcept.getTeamByAthlete` returns only *one* team. An athlete can be on multiple teams.
    // This requires `TeamMembershipConcept.getTeamsByAthlete(athleteId: UserID): Team[]`.
    // For now, this sync is limited and only considers one team if `getTeamByAthlete` is used.
    actions(
      [TeamMembershipConcept.getTeamByAthlete, { athleteId: userId }, { team: "team_obj" }],
    ),
  ],
  then: actions(
    // This `then` clause only fires if the role transition condition is met.
    [TeamMembershipConcept.removeAthlete, { title: (team_obj as Team).name, athlete: user_obj_before_change }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

export const NotifyTeamIfCoachRoleChanges: Sync = (
  { request, userId, role: new_role, set_role_output, user_obj_before_change, team_obj, new_notification_id, admin_user_obj },
) => ({
  when: [
    actions(
      [Requesting.request, { path: "/api/UserDirectory/setRole", userId, role: new_role }, { request }],
    ),
    actions(
      [UserDirectoryConcept.getUser, { userId }, { user: "user_obj_before_change" }], // Get user BEFORE role change
    ),
    actions(
      [UserDirectoryConcept.setRole, { userId, role: new_role }, { newRole: new_role, oldRole: "old_role_val" }], // Assume setRole returns oldRole
    ),
    // Conditional logic: only fire if old role was Coach and new role is not Coach
    // Assuming `old_role_val === Role.Coach && new_role !== Role.Coach` as an implicit filter.
    actions(
      [TeamMembershipConcept.getTeamByCoach, { coachId: userId }, { team: "team_obj" }], // Find the team coached by this user
    ),
    // Gaps: Need a system admin user for `sender`. Assuming "admin:system" is a valid UserID.
    actions(
      [UserDirectoryConcept.getUser, { userId: "admin:system" as UserID }, { user: "admin_user_obj" }],
    ),
  ],
  then: actions(
    [
      NotificationsConcept.create,
      {
        sender: admin_user_obj,
        recipients: (team_obj as Team).athletes,
        events: [],
        additionalMessage: `Your team "${(team_obj as Team).name}" no longer has a coach. Please contact support.`,
        scheduledAt: new Date(),
      },
      { id: "new_notification_id" },
    ],
    [NotificationsConcept.send, { notification: new_notification_id }],
    [Requesting.respond, { request, success: {} as Empty }],
  ),
});

// --- 5. Scheduled Notifications Delivery Sync ---

// Gaps: This requires `NotificationsConcept` to have a `_getPendingScheduledNotifications` query
// and for `NotificationsConcept.send` to mark the notification as sent (e.g., update its status).
// Assuming these are implemented in NotificationsConcept.

export const DeliverScheduledNotifications: Sync = (
  { notification_doc, sent_result },
) => ({
  when: [
    // This represents a system-level trigger.
    // Assuming `NotificationsConcept._getPendingScheduledNotifications` is a query
    // that the sync engine can poll or subscribe to based on time.
    actions(
      [NotificationsConcept._getPendingScheduledNotifications, {}, { notification: "notification_doc" }], // Returns an array of pending notifications, iterating one by one
    ),
    // Implicit 'where': `notification_doc.scheduledAt <= Date.now()` and `notification_doc.status === "pending"`
  ],
  then: actions(
    [NotificationsConcept.send, { notification: (notification_doc as NotificationDoc)._id }, { result: "sent_result" }],
    // The `send` action should internally mark the notification as 'sent'.
    // If not, a `NotificationsConcept.markNotificationAsSent` would be needed here.
  ),
});

// Export all syncs
export default [
  AuthorizeCoachCreateTeam,
  AuthorizeCoachAddAthleteToTeam,
  AuthorizeCoachRemoveAthleteFromTeam,
  AuthorizeCoachCreateCalendarEvent,
  AuthorizeCoachEditCalendarEvent,
  AuthorizeCoachDeleteCalendarEvent,
  AuthorizeCoachDuplicateCalendarEvent,
  AuthorizeCoachCreateNotification,
  AuthorizeCoachAddEventToNotification,
  AuthorizeCoachCreateWeeklySummaryForAthlete,
  AuthorizeAthleteJoinTeam,
  AuthorizeAthleteLeaveTeam,
  AuthorizeAthleteLogDailyEntry,
  AutoCreateAndSendNotificationForNewEvent,
  AutoCreateAndSendNotificationForEditedEvent,
  AutoCreateAndSendNotificationForDeletedEvent,
  UpdateUserWeeklyMileageAfterSummary,
  RemoveAthleteFromTeamsIfRoleChangesFromAthlete,
  NotifyTeamIfCoachRoleChanges,
  DeliverScheduledNotifications,
];
```
