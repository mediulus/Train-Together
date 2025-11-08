import {
  Requesting,
  UserDirectory,
  TeamMembership,
  CalanderEvent,
  Notification,
} from "@concepts";
import { actions, Frames, Sync } from "@engine";

// ============================================================================
// CREATE TEAM SYNCS
// ============================================================================

export const CreateTeamRequest: Sync = ({
  request,
  coachId,
  title,
  passKey,
  role,
  coach,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/TeamMembership/createTeam", coachId, title, passKey },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const coachIdValue = originalFrame[coachId];

    // Lookup role and user (calling concept methods directly, not as actions)
    // @ts-ignore - frame symbols to ID type conversion
    const roleResult = await UserDirectory.getUserRole({
      userId: coachIdValue,
    });
    // @ts-ignore - frame symbols to ID type conversion
    const userResult = await UserDirectory.getUser({ userId: coachIdValue });

    // Handle errors
    if (roleResult && typeof roleResult === "object" && "error" in roleResult) {
      return new Frames();
    }
    if (typeof userResult === "object" && "error" in userResult) {
      return new Frames();
    }

    // Authorization check
    if (roleResult !== "coach") {
      return new Frames();
    }

    // Return frame with bound variables for then clause
    return new Frames({
      ...originalFrame,
      [coach]: userResult,
      [role]: roleResult,
    });
  },
  then: actions([TeamMembership.createTeam, { title, coach, passKey }]),
});

// Success Response - match on request + successful team creation
export const CreateTeamResponseSuccess: Sync = ({ request, newTeam }) => ({
  when: actions(
    [Requesting.request, { path: "/TeamMembership/createTeam" }, { request }],
    [TeamMembership.createTeam, {}, { newTeam }]
  ),
  then: actions([Requesting.respond, { request, newTeam }]),
});

// Error Response - match on request + failed team creation
export const CreateTeamResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/TeamMembership/createTeam" }, { request }],
    [TeamMembership.createTeam, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// ============================================================================
// DELETE TEAM SYNCS
// ============================================================================

// Request + Authorization + Team Deletion
export const DeleteTeamRequest: Sync = ({
  request,
  title,
  coachId,
  role,
  coach,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/TeamMembership/deleteTeam", title, coachId },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const coachIdValue = originalFrame[coachId];

    // Lookup role and user (authorization check)
    // @ts-ignore - frame symbols to ID type conversion
    const roleResult = await UserDirectory.getUserRole({
      userId: coachIdValue,
    });
    // @ts-ignore - frame symbols to ID type conversion
    const userResult = await UserDirectory.getUser({ userId: coachIdValue });

    // Handle errors
    if (roleResult && typeof roleResult === "object" && "error" in roleResult) {
      return new Frames();
    }
    if (typeof userResult === "object" && "error" in userResult) {
      return new Frames();
    }

    // Authorization check - must be a coach
    if (roleResult !== "coach") {
      return new Frames();
    }

    // Return frame with bound variables for then clause
    return new Frames({
      ...originalFrame,
      [coach]: userResult,
      [role]: roleResult,
    });
  },
  then: actions([TeamMembership.deleteTeam, { title, coachId }]),
});

// Success Response - match on request + successful team deletion
export const DeleteTeamResponseSuccess: Sync = ({ request }) => ({
  when: actions(
    [Requesting.request, { path: "/TeamMembership/deleteTeam" }, { request }],
    [TeamMembership.deleteTeam, {}, {}]
  ),
  then: actions([Requesting.respond, { request, status: "deleted" }]),
});

// Error Response - match on request + failed team deletion
export const DeleteTeamResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/TeamMembership/deleteTeam" }, { request }],
    [TeamMembership.deleteTeam, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// ============================================================================
// DELETE EVENT SYNCS
// ============================================================================

// Request + Authorization + Event Deletion
export const DeleteEventRequest: Sync = ({
  request,
  eventId,
  coachId,
  role,
  event,
  team,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/CalanderEvent/deleteEvent", eventId, coachId },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const coachIdValue = originalFrame[coachId];
    const eventIdValue = originalFrame[eventId];
    const requestValue = originalFrame[request];

    // 1. Check if user is a coach
    // @ts-ignore - frame symbols to ID type conversion
    const roleResult = await UserDirectory.getUserRole({
      userId: coachIdValue,
    });

    // Handle errors
    if (roleResult && typeof roleResult === "object" && "error" in roleResult) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Failed to verify user role.",
      });
      return new Frames();
    }

    // Authorization check - must be a coach
    if (roleResult !== "coach") {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Only coaches can delete events. Athletes cannot delete events.",
      });
      return new Frames();
    }

    // 2. Get the event to verify team ownership
    // @ts-ignore - frame symbols to ID type conversion
    const eventResult = await CalanderEvent.getEvent({ eventId: eventIdValue });

    if (typeof eventResult === "object" && "error" in eventResult) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Event not found.",
      });
      return new Frames();
    }

    // 3. Get the coach's team
    // @ts-ignore - frame symbols to ID type conversion
    const teamResult = await TeamMembership.getTeamByCoach({
      coachId: coachIdValue,
    });

    if (typeof teamResult === "object" && "error" in teamResult) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Coach does not have a team.",
      });
      return new Frames();
    }

    // 4. Verify the event belongs to the coach's team
    if (String(eventResult.teamId) !== String(teamResult._id)) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "You can only delete events from your own team.",
      });
      return new Frames();
    }

    // Return frame with bound variables for then clause
    return new Frames({
      ...originalFrame,
      [role]: roleResult,
      [event]: eventResult,
      [team]: teamResult,
    });
  },
  then: actions([CalanderEvent.deleteEvent, { eventId }]),
});

// Success Response - match on request + successful event deletion
export const DeleteEventResponseSuccess: Sync = ({ request }) => ({
  when: actions(
    [Requesting.request, { path: "/CalanderEvent/deleteEvent" }, { request }],
    [CalanderEvent.deleteEvent, {}, {}]
  ),
  then: actions([Requesting.respond, { request, status: "deleted" }]),
});

// Error Response - match on request + failed event deletion
export const DeleteEventResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/CalanderEvent/deleteEvent" }, { request }],
    [CalanderEvent.deleteEvent, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// ============================================================================
// CREATE EVENT SYNCS
// ============================================================================

// Request + Authorization + Event Creation
// Note: description and link are optional and NOT in the sync parameters
// They are accessed from the request data in the where clause
export const CreateEventRequest: Sync = ({
  request,
  teamId,
  startTime,
  endTime,
  location,
  title,
  coachId,
  role,
  team,
}) => ({
  when: actions([
    Requesting.request,
    {
      path: "/CalanderEvent/createEvent",
      teamId,
      startTime,
      endTime,
      location,
      title,
      coachId,
    },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const coachIdValue = originalFrame[coachId];
    const teamIdValue = originalFrame[teamId];
    const requestValue = originalFrame[request];

    // Get optional description and link from request data
    // @ts-ignore
    const requestData = await Requesting.requests.findOne({
      _id: requestValue,
    });
    const descriptionValue = requestData?.input?.description;
    const linkValue = requestData?.input?.link;

    // 1. Check if user is a coach
    // @ts-ignore
    const roleResult = await UserDirectory.getUserRole({
      userId: coachIdValue,
    });

    if (roleResult && typeof roleResult === "object" && "error" in roleResult) {
      // @ts-ignore
      await Requesting.respond({
        request: requestValue,
        error: "Failed to verify user role.",
      });
      return new Frames();
    }

    if (roleResult !== "coach") {
      // @ts-ignore
      await Requesting.respond({
        request: requestValue,
        error: "Only coaches can create events.",
      });
      return new Frames();
    }

    // 2. Get the coach's team
    // @ts-ignore
    const teamResult = await TeamMembership.getTeamByCoach({
      coachId: coachIdValue,
    });

    if (typeof teamResult === "object" && "error" in teamResult) {
      // @ts-ignore
      await Requesting.respond({
        request: requestValue,
        error: "Coach does not have a team.",
      });
      return new Frames();
    }

    // 3. Verify teamId matches coach's team
    if (String(teamIdValue) !== String(teamResult._id)) {
      // @ts-ignore
      await Requesting.respond({
        request: requestValue,
        error: "You can only create events for your own team.",
      });
      return new Frames();
    }

    // 4. Call createEvent with all fields including optional ones
    const createPayload: Record<string, unknown> = {
      teamId: teamIdValue,
      startTime: originalFrame[startTime],
      endTime: originalFrame[endTime],
      location: originalFrame[location],
      title: originalFrame[title],
    };
    if (descriptionValue) createPayload.description = descriptionValue;
    if (linkValue) createPayload.link = linkValue;

    // @ts-ignore
    const eventResult = await CalanderEvent.createEvent(createPayload);

    // Respond based on result
    if (typeof eventResult === "object" && "error" in eventResult) {
      // @ts-ignore
      await Requesting.respond({
        request: requestValue,
        error: eventResult.error,
      });
    } else if (typeof eventResult === "object" && "event" in eventResult) {
      // @ts-ignore
      await Requesting.respond({
        request: requestValue,
        event: eventResult.event,
      });
    }

    return new Frames();
  },
  // Must provide ActionPattern[] for then - empty array means no additional actions
  then: [],
});

// ============================================================================
// EDIT EVENT SYNCS
// ============================================================================

// Request + Authorization + Event Editing
export const EditEventRequest: Sync = ({
  request,
  eventId,
  updates,
  coachId,
  role,
  event,
  team,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/CalanderEvent/editEvent", eventId, updates, coachId },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const coachIdValue = originalFrame[coachId];
    const eventIdValue = originalFrame[eventId];
    const requestValue = originalFrame[request];

    // Get the full request data to access the updates object properly
    // @ts-ignore - accessing internal request data
    const requestData = await Requesting.requests.findOne({
      _id: requestValue,
    });
    const updatesValue = requestData?.input?.updates;

    // 1. Check if user is a coach
    // @ts-ignore - frame symbols to ID type conversion
    const roleResult = await UserDirectory.getUserRole({
      userId: coachIdValue,
    });

    // Handle errors
    if (roleResult && typeof roleResult === "object" && "error" in roleResult) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Failed to verify user role.",
      });
      return new Frames();
    }

    // Authorization check - must be a coach
    if (roleResult !== "coach") {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Only coaches can edit events.",
      });
      return new Frames();
    }

    // 2. Get the event to find its team
    // @ts-ignore - frame symbols to ID type conversion
    const eventResult = await CalanderEvent.getEvent({ eventId: eventIdValue });

    if (
      eventResult &&
      typeof eventResult === "object" &&
      "error" in eventResult
    ) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Event not found.",
      });
      return new Frames();
    }

    // 3. Get the team to verify coach ownership
    // @ts-ignore - frame symbols to ID type conversion
    const teamResult = await TeamMembership.getTeamByCoach({
      coachId: coachIdValue,
    });

    if (teamResult && typeof teamResult === "object" && "error" in teamResult) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Coach does not have a team.",
      });
      return new Frames();
    }

    // 4. Verify the event belongs to the coach's team
    if (String(eventResult.teamId) !== String(teamResult._id)) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "You can only edit events for your own team.",
      });
      return new Frames();
    }

    // Return frame with bound variables for then clause (including properly fetched updates)
    return new Frames({
      ...originalFrame,
      [role]: roleResult,
      [event]: eventResult,
      [team]: teamResult,
      [updates]: updatesValue,
    });
  },
  then: actions([CalanderEvent.editEvent, { eventId, updates }]),
});

// Success Response - match on request + successful event editing
export const EditEventResponseSuccess: Sync = ({ request }) => ({
  when: actions(
    [Requesting.request, { path: "/CalanderEvent/editEvent" }, { request }],
    [CalanderEvent.editEvent, {}, {}]
  ),
  then: actions([Requesting.respond, { request, status: "updated" }]),
});

// Error Response - match on request + failed event editing
export const EditEventResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/CalanderEvent/editEvent" }, { request }],
    [CalanderEvent.editEvent, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// ============================================================================
// REMOVE ATHLETE SYNCS
// ============================================================================

// Request + Authorization + Remove Athlete
export const RemoveAthleteRequest: Sync = ({
  request,
  title,
  athleteId,
  role,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/TeamMembership/removeAthlete", title, athleteId },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const athleteIdValue = originalFrame[athleteId];
    const requestValue = originalFrame[request];

    // 1. Check if user is an athlete
    // @ts-ignore - frame symbols to ID type conversion
    const roleResult = await UserDirectory.getUserRole({
      userId: athleteIdValue,
    });

    // Handle errors
    if (roleResult && typeof roleResult === "object" && "error" in roleResult) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Failed to verify user role.",
      });
      return new Frames();
    }

    // Authorization check - must be an athlete
    if (roleResult !== "athlete") {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Only athletes can leave teams. Coaches cannot use this action.",
      });
      return new Frames();
    }

    // Return frame with bound variables for then clause
    return new Frames({
      ...originalFrame,
      [role]: roleResult,
    });
  },
  then: actions([TeamMembership.removeAthlete, { title, athleteId }]),
});

// Success Response - match on request + successful athlete removal
export const RemoveAthleteResponseSuccess: Sync = ({ request }) => ({
  when: actions(
    [
      Requesting.request,
      { path: "/TeamMembership/removeAthlete" },
      { request },
    ],
    [TeamMembership.removeAthlete, {}, {}]
  ),
  then: actions([Requesting.respond, { request, status: "removed" }]),
});

// Error Response - match on request + failed athlete removal
export const RemoveAthleteResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [
      Requesting.request,
      { path: "/TeamMembership/removeAthlete" },
      { request },
    ],
    [TeamMembership.removeAthlete, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// ============================================================================
// ADD ATHLETE SYNCS
// ============================================================================

// Request + Get Full Athlete Object + Add to Team
export const AddAthleteRequest: Sync = ({
  request,
  title,
  athleteId,
  passKey,
  athlete,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/TeamMembership/addAthlete", title, athleteId, passKey },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const athleteIdValue = originalFrame[athleteId];
    const requestValue = originalFrame[request];

    // Get the full athlete User object
    // @ts-ignore - frame symbols to ID type conversion
    const athleteResult = await UserDirectory.getUser({
      userId: athleteIdValue,
    });

    // Handle errors
    if (
      athleteResult &&
      typeof athleteResult === "object" &&
      "error" in athleteResult
    ) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Athlete not found.",
      });
      return new Frames();
    }

    // Return frame with full athlete object
    return new Frames({
      ...originalFrame,
      [athlete]: athleteResult,
    });
  },
  then: actions([TeamMembership.addAthlete, { title, athlete, passKey }]),
});

// Success Response - match on request + successful athlete addition
export const AddAthleteResponseSuccess: Sync = ({ request }) => ({
  when: actions(
    [Requesting.request, { path: "/TeamMembership/addAthlete" }, { request }],
    [TeamMembership.addAthlete, {}, {}]
  ),
  then: actions([Requesting.respond, { request, status: "added" }]),
});

// Error Response - match on request + failed athlete addition
export const AddAthleteResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/TeamMembership/addAthlete" }, { request }],
    [TeamMembership.addAthlete, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// ============================================================================
// SET WEEKLY MILEAGE SYNCS
// ============================================================================

// Request + Authorization + Set Weekly Mileage
export const SetWeeklyMileageRequest: Sync = ({
  request,
  userId,
  newMileage,
  role,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/UserDirectory/setWeeklyMileage", userId, newMileage },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const userIdValue = originalFrame[userId];
    const requestValue = originalFrame[request];

    // 1. Check if user is an athlete
    // @ts-ignore - frame symbols to ID type conversion
    const roleResult = await UserDirectory.getUserRole({
      userId: userIdValue,
    });

    // Handle errors
    if (roleResult && typeof roleResult === "object" && "error" in roleResult) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Failed to verify user role.",
      });
      return new Frames();
    }

    // Authorization check - must be an athlete
    if (roleResult !== "athlete") {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Only athletes can set weekly mileage goals.",
      });
      return new Frames();
    }

    // Return frame with bound variables for then clause
    return new Frames({
      ...originalFrame,
      [role]: roleResult,
    });
  },
  then: actions([
    UserDirectory.setWeeklyMileage,
    { userId, weeklyMileage: newMileage },
  ]),
});

// Success Response - match on request + successful mileage update
export const SetWeeklyMileageResponseSuccess: Sync = ({ request }) => ({
  when: actions(
    [
      Requesting.request,
      { path: "/UserDirectory/setWeeklyMileage" },
      { request },
    ],
    [UserDirectory.setWeeklyMileage, {}, {}]
  ),
  then: actions([Requesting.respond, { request, status: "updated" }]),
});

// Error Response - match on request + failed mileage update
export const SetWeeklyMileageResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [
      Requesting.request,
      { path: "/UserDirectory/setWeeklyMileage" },
      { request },
    ],
    [UserDirectory.setWeeklyMileage, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// ============================================================================
// SET ROLE SYNCS
// ============================================================================

// Request + Authorization + Set Role (prevent role change if user is on a team)
export const SetRoleRequest: Sync = ({
  request,
  userId,
  role,
  currentRole,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/UserDirectory/setRole", userId, role },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const userIdValue = originalFrame[userId];
    const requestValue = originalFrame[request];

    // 1. Get the user's current role
    // @ts-ignore - frame symbols to ID type conversion
    const currentRoleResult = await UserDirectory.getUserRole({
      userId: userIdValue,
    });

    // Handle errors
    if (
      currentRoleResult &&
      typeof currentRoleResult === "object" &&
      "error" in currentRoleResult
    ) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Failed to get user role.",
      });
      return new Frames();
    }

    // 2. Check if user is on a team (either as coach or athlete)
    let isOnTeam = false;

    // Check if they're a coach with a team
    // @ts-ignore - frame symbols to ID type conversion
    const coachTeam = await TeamMembership.getTeamByCoach({
      coachId: userIdValue,
    });
    if (coachTeam && !("error" in coachTeam)) {
      isOnTeam = true;
    }

    // Check if they're an athlete on a team
    // @ts-ignore - frame symbols to ID type conversion
    const athleteTeam = await TeamMembership.getTeamByAthlete({
      athleteId: userIdValue,
    });
    if (athleteTeam && !("error" in athleteTeam)) {
      isOnTeam = true;
    }

    // 3. If user is on a team, prevent role change
    if (isOnTeam) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error:
          "Cannot change role while you are part of a team. Please leave or disband your team first.",
      });
      return new Frames();
    }

    // 4. Allow role change if not on any team
    return new Frames({
      ...originalFrame,
      [currentRole]: currentRoleResult,
    });
  },
  then: actions([UserDirectory.setRole, { userId, role }]),
});

// Success Response - match on request + successful role update
export const SetRoleResponseSuccess: Sync = ({ request }) => ({
  when: actions(
    [Requesting.request, { path: "/UserDirectory/setRole" }, { request }],
    [UserDirectory.setRole, {}, {}]
  ),
  then: actions([Requesting.respond, { request, status: "updated" }]),
});

// Error Response - match on request + failed role update
export const SetRoleResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/UserDirectory/setRole" }, { request }],
    [UserDirectory.setRole, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// ============================================================================
// NOTIFICATION SYNCS
// ============================================================================

// Request + Orchestration: Lookup data and create notification
export const CreateNotificationRequest: Sync = ({
  request,
  senderId,
  eventIds,
  additionalMessage,
  sender,
  recipients,
  events,
}) => ({
  when: actions([
    Requesting.request,
    { path: "/Notification/create", senderId, eventIds, additionalMessage },
    { request },
  ]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const senderIdValue = originalFrame[senderId];
    const eventIdsValue = originalFrame[eventIds];
    const additionalMessageValue = originalFrame[additionalMessage] || "";
    const requestValue = originalFrame[request];

    // 1. Get sender user
    // @ts-ignore - frame symbols to ID type conversion
    const senderResult = await UserDirectory.getUser({ userId: senderIdValue });
    if (typeof senderResult === "object" && "error" in senderResult) {
      // @ts-ignore
      await Requesting.respond({
        request: requestValue,
        error: "Sender not found.",
      });
      return new Frames();
    }

    // 2. Get sender's team to find recipients (athletes)
    // @ts-ignore - frame symbols to ID type conversion
    const teamResult = await TeamMembership.getTeamByCoach({
      coachId: senderIdValue,
    });
    if (typeof teamResult === "object" && "error" in teamResult) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Sender does not have a team.",
      });
      return new Frames();
    }

    // Get athlete refs (just IDs) from team
    const athleteRefs = teamResult.athletes || [];
    if (athleteRefs.length === 0) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "No athletes found on the team.",
      });
      return new Frames();
    }

    // Fetch full User objects for each athlete
    const athletesList = [];
    for (const athleteRef of athleteRefs) {
      // @ts-ignore - frame symbols to ID type conversion
      const athleteResult = await UserDirectory.getUser({
        userId: athleteRef._id,
      });
      if (typeof athleteResult === "object" && "error" in athleteResult) {
        // Skip athletes that can't be found, but continue with others
        continue;
      }
      athletesList.push(athleteResult);
    }

    if (athletesList.length === 0) {
      // @ts-ignore - frame symbols to ID type conversion
      await Requesting.respond({
        request: requestValue,
        error: "Could not fetch athlete details.",
      });
      return new Frames();
    }

    // 3. Get all events
    const eventsList = [];
    for (const eid of eventIdsValue as string[]) {
      // @ts-ignore - frame symbols to ID type conversion
      const eventResult = await CalanderEvent.getEvent({ eventId: eid });
      if (typeof eventResult === "object" && "error" in eventResult) {
        // @ts-ignore
        await Requesting.respond({
          request: requestValue,
          error: `Event with ID ${eid} not found.`,
        });
        return new Frames();
      }
      eventsList.push(eventResult);
    }

    // Return enriched frame with full objects
    return new Frames({
      ...originalFrame,
      [sender]: senderResult,
      [recipients]: athletesList,
      [events]: eventsList,
      [additionalMessage]: additionalMessageValue,
    });
  },
  then: actions([
    Notification.create,
    { sender, recipients, events, additionalMessage },
  ]),
});

// When notification is created, immediately send it
export const SendCreatedNotification: Sync = ({ request, notificationId }) => ({
  when: actions(
    [Requesting.request, { path: "/Notification/create" }, { request }],
    [Notification.create, {}, { id: notificationId }]
  ),
  then: actions([Notification.send, { notificationId }]),
});

// Success Response - when notification is sent
export const SendNotificationResponseSuccess: Sync = ({ request }) => ({
  when: actions(
    [Requesting.request, { path: "/Notification/create" }, { request }],
    [Notification.send, {}, {}]
  ),
  then: actions([Requesting.respond, { request, status: "sent" }]),
});

// Error Response - when notification creation fails
export const CreateNotificationResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/Notification/create" }, { request }],
    [Notification.create, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});

// Error Response - when notification send fails
export const SendNotificationResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/Notification/create" }, { request }],
    [Notification.send, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});
