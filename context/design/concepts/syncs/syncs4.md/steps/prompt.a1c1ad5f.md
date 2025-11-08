---
timestamp: 'Fri Nov 07 2025 23:17:04 GMT-0500 (Eastern Standard Time)'
parent: '[[../20251107_231704.0b5eae8e.md]]'
content_id: a1c1ad5fa124bdf87c68d3b34d30027e4c0cf2078364ab76cc3769fb32a285d0
---

# prompt: do you see somthing wrong with this :

/\*\*

* Sample synchronizations: feel free to delete this entire file!
  \*/

import { Requesting, UserDirectory, TeamMembership } from "@concepts";
import { actions, Sync } from "@engine";

// ---------------- TEAM MEMBERSHIP: Coach-only createTeam multi-stage flow ---------------- //
// Stage 1: Load coach user + role
export const CreateTeamLoad: Sync = ({
request,
coachId,
title,
passKey,
coach,
role,
}) => ({
when: actions(\[
Requesting.request,
{ path: "/TeamMembership/createTeam", coachId, title, passKey },
{ request },
]),
then: actions(
\[UserDirectory.getUser, { userId: coachId }, { coach }],
\[UserDirectory.getUserRole, { userId: coachId }, { role }]
),
});

// Stage 2: Role !== coach -> respond error (guard early)
export const CreateTeamRoleError: Sync = ({
request,
coachId,
title,
passKey,
role,
}) => ({
when: actions(
\[
Requesting.request,
{ path: "/TeamMembership/createTeam", coachId, title, passKey },
{ request },
],
// IMPORTANT: must match original inputs for getUserRole (userId: coachId)
\[UserDirectory.getUserRole, { userId: coachId }, { role }]
),
where: (frames) =>
frames.filter(($) => $\[role] !== "coach" && $\[role] != null),
then: actions(\[
Requesting.respond,
{ request, error: "Only coaches can create teams." },
]),
});

// Stage 2: User lookup error
export const CreateTeamLookupError: Sync = ({
request,
coachId,
title,
passKey,
coach,
}) => ({
when: actions(
\[
Requesting.request,
{ path: "/TeamMembership/createTeam", coachId, title, passKey },
{ request },
],
// Must match original inputs for getUser (userId: coachId)
\[UserDirectory.getUser, { userId: coachId }, { coach }]
),
where: (frames) =>
frames.filter(
($) => !($\[coach] && typeof $\[coach] === "object" && "\_id" in $\[coach]),
),
then: actions(\[
Requesting.respond,
{ request, error: "Coach user not found." },
]),
});

// Stage 3: Role passes + user present -> invoke createTeam
export const CreateTeamCreate: Sync = ({
request,
coachId,
title,
passKey,
coach,
role,
newTeam,
\_error,
}) => ({
when: actions(
\[
Requesting.request,
{ path: "/TeamMembership/createTeam", coachId, title, passKey },
{ request },
],
\[UserDirectory.getUser, { userId: coachId }, { coach }],
\[UserDirectory.getUserRole, { userId: coachId }, { role }]
),
where: (frames) =>
frames
.filter(($) => $\[role] === "coach")
.filter(
($) => $\[coach] && typeof $\[coach] === "object" && "\_id" in $\[coach],
),
then: actions(\[
TeamMembership.createTeam,
{ title, coach, passKey },
{ newTeam },
]),
});

// Stage 4: Respond success
export const CreateTeamRespondSuccess: Sync = ({
request,
coachId,
title,
passKey,
coach,
role,
newTeam,
}) => ({
when: actions(
\[
Requesting.request,
{ path: "/TeamMembership/createTeam", coachId, title, passKey },
{ request },
],
\[UserDirectory.getUser, { userId: coachId }, { coach }],
\[UserDirectory.getUserRole, { userId: coachId }, { role }],
\[TeamMembership.createTeam, {}, { newTeam }]
),
where: (frames) =>
frames
.filter(($) => $\[role] === "coach")
.filter(
($) => $\[coach] && typeof $\[coach] === "object" && "\_id" in $\[coach],
)
.filter(($) => $\[newTeam] != null),
then: actions(\[Requesting.respond, { request, newTeam }]),
});

// Stage 4: Respond error from createTeam
export const CreateTeamRespondError: Sync = ({
request,
coachId,
title,
passKey,
coach,
role,
error,
}) => ({
when: actions(
\[
Requesting.request,
{ path: "/TeamMembership/createTeam", coachId, title, passKey },
{ request },
],
\[UserDirectory.getUser, { userId: coachId }, { coach }],
\[UserDirectory.getUserRole, { userId: coachId }, { role }],
\[TeamMembership.createTeam, {}, { error }]
),
where: (frames) =>
frames
.filter(($) => $\[role] === "coach")
.filter(
($) => $\[coach] && typeof $\[coach] === "object" && "\_id" in $\[coach],
)
.filter(($) => $\[error] != null),
then: actions(\[Requesting.respond, { request, error }]),
});
