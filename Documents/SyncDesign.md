# Synchronizations Design

This document organizes the repository's synchronizations into readable specs following the documentation style in `src/syncs/syncs.md`.

Sections

- [Coach Roles](#coach-roles)
- [Athlete Roles](#athlete-roles)
- [Prevent role changes while on a team](#prevent-role-change-while-on-a-team)
- [Notification: create -> send](#notification-create---send)

---

## Coach roles

These synchronizations require or verify that the requesting user is a coach and perform coach-scoped operations (create/delete teams, create/edit/delete events).

### CreateTeam

    when
        Requesting.request (path: "/TeamMembership/createTeam", coachId, title, passKey): (request)

    where 
        - Lookup `coachId` role via `UserDirectory.getUserRole` and user via `UserDirectory.getUser`.
         - Authorization: `role === "coach"`.

    then
        TeamMembership.createTeam (title, coach, passKey)

Response success

    when
        Requesting.request (path: "/TeamMembership/createTeam") : (request)
        TeamMembership.createTeam () : (newTeam)
    then
        Requesting.respond (request, newTeam)

Response error

    when
        Requesting.request (path: "/TeamMembership/createTeam") : (request)
        TeamMembership.createTeam () : (error)
    then
        Requesting.respond (request, error)

---

### DeleteTeam

    when
        Requesting.request (path: "/TeamMembership/deleteTeam", title, coachId): (request)

    where 
        - Lookup `coachId` role and user. 
        - Authorization: `role === "coach"`.

    then
        TeamMembership.deleteTeam (title, coachId)

Response success

    when
        Requesting.request (path: "/TeamMembership/deleteTeam") : (request)
        TeamMembership.deleteTeam () : ()
    then
        Requesting.respond (request, status: "deleted")

Response error

    when
        Requesting.request (path: "/TeamMembership/deleteTeam") : (request)
        TeamMembership.deleteTeam () : (error)
    then
        Requesting.respond (request, error)

---

### CreateEvent

    when
        Requesting.request (path: "/CalanderEvent/createEvent", teamId, startTime, endTime, location, title, coachId): (request)

    where 
        - Extract optional `description` and `link` from the original request input. 
        - Lookup `coachId` role via `UserDirectory.getUserRole`. 
        - Authorization: `role === "coach"`.
        - Lookup the coach's team via `TeamMembership.getTeamByCoach` and verify `teamId` matches coach's team _id_. 
        - Build full create payload (include description/link if present) and call `CalanderEvent.createEvent`.

    then
        (no direct `then` action patterns; event creation is performed in `where` via concept call)

Response success/error handled via separate syncs:

    - when Requesting.request + CalanderEvent.createEvent success -> Requesting.respond (status: "created")
    - when Requesting.request + CalanderEvent.createEvent error -> Requesting.respond (error)

---

### EditEvent

    when
        Requesting.request (path: "/CalanderEvent/editEvent", eventId, updates, coachId): (request)

    where 
        - Load full `updates` object from request input. 
        - Lookup `coachId` role and ensure `role === "coach"`. 
        - Fetch the event via `CalanderEvent.getEvent(eventId)`. 
        - Fetch coach's team via `TeamMembership.getTeamByCoach` and verify ownership.

    then
        CalanderEvent.editEvent (eventId, updates)

Response success

    when
        Requesting.request (path: "/CalanderEvent/editEvent") : (request)
        CalanderEvent.editEvent () : ()
    then
        Requesting.respond (request, status: "updated")

Response error

    when
        Requesting.request (path: "/CalanderEvent/editEvent") : (request)
        CalanderEvent.editEvent () : (error)
    then
        Requesting.respond (request, error)

---

### DeleteEvent

    when
        Requesting.request (path: "/CalanderEvent/deleteEvent", eventId, coachId): (request)

    where 
        - Lookup `coachId` role and ensure `role === "coach"`. 
        - Fetch event `CalanderEvent.getEvent(eventId)` and the coach's team `TeamMembership.getTeamByCoach`. 
        - Verify `event.teamId === team._id` to ensure ownership.

    then
        CalanderEvent.deleteEvent (eventId)

Response success

    when
        Requesting.request (path: "/CalanderEvent/deleteEvent") : (request)
        CalanderEvent.deleteEvent () : ()
    then
        Requesting.respond (request, status: "deleted")

Response error

    when
        Requesting.request (path: "/CalanderEvent/deleteEvent") : (request)
        CalanderEvent.deleteEvent () : (error)
    then
        Requesting.respond (request, error)

---

## Athlete roles

These synchronizations require or verify athlete role and perform athlete-scoped operations (remove/add athlete to/from team, set weekly mileage).

### AddAthlete

    when
        Requesting.request (path: "/TeamMembership/addAthlete", title, athleteId, passKey): (request)
    
    where 
        - Fetch full athlete user via `UserDirectory.getUser({ userId: athleteId })`.

    then
        TeamMembership.addAthlete (title, athlete, passKey)

Response success

    when
        Requesting.request (path: "/TeamMembership/addAthlete") : (request)
        TeamMembership.addAthlete () : ()
    then
        Requesting.respond (request, status: "added")

Response error

    when
        Requesting.request (path: "/TeamMembership/addAthlete") : (request)
        TeamMembership.addAthlete () : (error)
    then
        Requesting.respond (request, error)

---

### RemoveAthlete

    when
        Requesting.request (path: "/TeamMembership/removeAthlete", title, athleteId): (request)

    where 
        - Verify `athleteId` role via `UserDirectory.getUserRole` and require `role === "athlete"`.

    then
        TeamMembership.removeAthlete (title, athleteId)

Response success

    when
        Requesting.request (path: "/TeamMembership/removeAthlete") : (request)
        eamMembership.removeAthlete () : ()
    then
        Requesting.respond (request, status: "removed")

Response error

    when
        Requesting.request (path: "/TeamMembership/removeAthlete") : (request)
        TeamMembership.removeAthlete () : (error)
    then
        Requesting.respond (request, error)

---

### SetWeeklyMileage

    when
        Requesting.request (path: "/UserDirectory/setWeeklyMileage", userId, newMileage): (request)

    where 
        - Verify `userId` role via `UserDirectory.getUserRole` and require `role === "athlete"`.

    then
        UserDirectory.setWeeklyMileage (userId, weeklyMileage: newMileage)

Response success

    when
        Requesting.request (path: "/UserDirectory/setWeeklyMileage") : (request)
        UserDirectory.setWeeklyMileage () : ()
    then
        Requesting.respond (request, status: "updated")

Response error

    when
        Requesting.request (path: "/UserDirectory/setWeeklyMileage") : (request)
        UserDirectory.setWeeklyMileage () : (error)
    then
        Requesting.respond (request, error)

---

## Prevent role change while on a team

This synchronization enforces that a user's role cannot be changed if they are currently a member of a team.

### SetRole (with team-check)

    when
        Requesting.request (path: "/UserDirectory/setRole", userId, role): (request)

    where 
        - Lookup whether `userId` is on a team (e.g. via `TeamMembership.getTeamByAthlete` or similar).
        - If the user is on a team, block the role change (return frames that filter out the change and respond with an error).

    then
        UserDirectory.setRole (userId, role)

Response success

    when
        Requesting.request (path: "/UserDirectory/setRole") : (request)
        UserDirectory.setRole () : ()
    then
        Requesting.respond (request, status: "updated")

Response error

    when
        Requesting.request (path: "/UserDirectory/setRole") : (request)
        UserDirectory.setRole () : (error)
    then
        Requesting.respond (request, error)

Notes

- The actual sample.sync.ts includes a `where` that intends to check for the user's current team membership before allowing a role change. Implementers should call `TeamMembership` queries in the `where` clause and respond with a helpful error when blocked.

---

## Notification create -> send

Orchestration for creating notifications and immediately sending them.

### CreateNotificationRequest

    when
        Requesting.request (path: "/Notification/create", senderId, eventIds, additionalMessage): (request)

    where 
        - Lookup sender user and recipient lists, expand `eventIds` into event objects via `CalanderEvent.getEvent` or concept queries. 
        - Collect `sender`, `recipients`, and `events` bindings.

    then
        Notification.create (sender, recipients, events, additionalMessage)

### SendCreatedNotification

    when
        Requesting.request (path: "/Notification/create") : (request)
        Notification.create () : (id: notificationId)
    then
        Notification.send (notificationId)

Response success

    when
        Requesting.request (path: "/Notification/create") : (request)
        Notification.send () : ()
    then
        Requesting.respond (request, status: "sent")

Response error

    when
        Requesting.request (path: "/Notification/create") : (request)
        Notification.create () : (error)
    then
        Requesting.respond (request, error)

When send fails

    when
        Requesting.request (path: "/Notification/create") : (request)
        Notification.send () : (error)
    then
        Requesting.respond (request, error)
