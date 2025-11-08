---
timestamp: 'Fri Nov 07 2025 19:30:06 GMT-0500 (Eastern Standard Time)'
parent: '[[../20251107_193006.d889b092.md]]'
content_id: 7bd140a6754371aacc8a17fa4fb91497ad56b61bcdad8eba10674bb5132447eb
---

# prompt: Here are my paths and concepts. How should I design my syncs?

WARNING - UNVERIFIED ROUTE: /api/CalanderEvent/getEvent
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

import { Collection, Db } from "mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

const PREFIX = "CalnderEvent" + ".";

type EventID = ID;

/\*\*

* @interface Event
  \*/
  export interface Event {
  \_id: EventID;
  teamId: ID; // team scope
  startTime: Date;
  endTime: Date;
  location: string;
  title: string;
  description?: string;
  link?: string;
  }

/\*\*

* @concept CalendarEvent
* @purpose Post and update team events (practices, meets, deadlines).
* @principle When a coach posts or updates an event, all team athletes can view it.
  \*/
  export default class CalanderEventConcept {
  private events: Collection<Event>;

constructor(private readonly db: Db) {
this.events = this.db.collection<Event>(PREFIX + "events");
}

/\*\*

* @requires event exists
* @effects returns the event
*
* @param eventId the id of the event you want
* @returns the event you queried
  \*/
  async getEvent(eventId: EventID): Promise\<Event | { error: string }> {
  const event = await this.events.findOne({ \_id: eventId });

```
if (!event) return { error: `Event with ID '${eventId}' does not exist.` };
```

```
return event;
```

}

/\*\*

* creates a new calander event for the teams calander
*
* @requires startTime < endTime
* @effects generates and returns a new calander event with the corresponding attributes
*
* @param startTime The start time of the event.
* @param endTime The end time of the event.
* @param location The physical location of the event.
* @param title The title of the event.
* @param description An optional detailed description of the event.
* @param link An optional URL link related to the event.
*
* @returns Returns the ID of the newly created event on success, or an error message.
  \*/

async createEvent(
teamId: ID,
startTime: Date,
endTime: Date,
location: string,
title: string,
description?: string,
link?: string
): Promise<{ event: EventID } | { error: string }> {
//verify timing constraint
if (startTime.getTime() >= endTime.getTime()) {
return { error: "Event start time must be before end time." };
}

```
const newEvent: Event = {
  _id: freshID(), // Generate a new, unique ID for the event
  teamId,
  startTime,
  endTime,
  location,
  title,
  description,
  link,
};

try {
  await this.events.insertOne(newEvent);
  return { event: newEvent._id };
} catch (e) {
  console.error("Error creating event:", e);
  return { error: "Failed to create event due to a database error." };
}
```

}

/\*\*

* deletes the event based on the event id
*
* @requires event exists
* @effects deletes the event with the given id
*
* @param event The ID of the event to delete.
*
* @returns an empty object on success, or an error message.
  \*/
  async deleteEvent(event: EventID): Promise\<Empty | { error: string }> {
  // Requires: event exists
  try {
  const result = await this.events.deleteOne({ \_id: event });

  if (result.deletedCount === 0) {
  return { error: `Event with ID '${event}' not found.` };
  }
  return {};
  } catch (e) {
  console.error("Error deleting event:", e);
  return { error: "Failed to delete event due to a database error." };
  }
  }

/\*\*

* Edits a part(s) of the event
*
* @requires all updates are an attribute of event
* @requires if changing start or end time that they are still start < end
* @effects edits the event
*
* @param {Object} args - The arguments for editing an event.
* @param {UserIdentifier} args.editor - The identifier of the user editing the event.
* @param {EventID} args.event - The ID of the event to edit.
* @param {Partial\<Omit\<EventDocument, "\_id">>} args.updates - An object containing fields to update and their new values.
*
* @returns an empty object on success, or an error message.
  \*/
  async editEvent(
  event: EventID,
  updates: Partial\<Omit\<Event, "\_id">>
  ): Promise\<Empty | { error: string }> {
  try {
  // make sure only the updateable fields are there
  const EDITABLE\_FIELDS = new Set\<keyof Omit\<Event, "\_id">>(\[
  "startTime",
  "endTime",
  "location",
  "title",
  "description",
  "link",
  ]);
  const badKeys = Object.keys(updates).filter(
  (k) => !EDITABLE\_FIELDS.has(k as keyof Omit\<Event, "\_id">)
  );
  if (badKeys.length > 0) {
  return {
  error: `Unknown or disallowed fields in updates: ${badKeys.join(
         ", "
       )}`,
  };
  }

  // Fetch existing event
  const existingEvent = await this.events.findOne({ \_id: event });
  if (!existingEvent) {
  return { error: `Event with ID '${event}' not found.` };
  }

  // Basic runtime type checks for Dates on provided fields
  const isValidDate = (d: unknown): d is Date =>
  d instanceof Date && !isNaN(d.getTime());

  if (updates.startTime !== undefined && !isValidDate(updates.startTime)) {
  return { error: "startTime must be a valid Date object." };
  }
  if (updates.endTime !== undefined && !isValidDate(updates.endTime)) {
  return { error: "endTime must be a valid Date object." };
  }

  // Tif either boundary is changing, ensure start < end
  if (updates.startTime !== undefined || updates.endTime !== undefined) {
  const newStart = updates.startTime ?? existingEvent.startTime;
  const newEnd = updates.endTime ?? existingEvent.endTime;
  if (!isValidDate(newStart) || !isValidDate(newEnd)) {
  return { error: "startTime/endTime must be valid Date objects." };
  }
  if (newStart.getTime() >= newEnd.getTime()) {
  return { error: "Updated start time must be before end time." };
  }
  }

  // Build MongoDB update ($set / $unset)
  // Clearing policy: description/link can be cleared by passing "" (or null at runtime).
  const $set: Partial<Event> = {};
  const $unset: Record\<string, ""> = {};

  for (const \[k, v] of Object.entries(updates) as Array<
  \[keyof Omit\<Event, "\_id">, unknown]

  > ) {
  > if (v === undefined) continue; // omit → no change

  if ((k === "description" || k === "link") && (v === "" || v === null)) {
  $unset\[k] = "";
  continue;
  }

  // For all other fields, set directly (types assumed correct at this layer)
  // Narrow assignment using keyof and type guard
  ($set as Record\<string, unknown>)\[k as string] = v as never;
  }

  // If nothing to change, short-circuit
  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
  return {};
  }

  const updateDoc: Record\<string, unknown> = {};
  if (Object.keys($set).length) updateDoc.$set = $set;
  if (Object.keys($unset).length) updateDoc.$unset = $unset;

  // 7) Apply the update
  const result = await this.events.updateOne({ \_id: event }, updateDoc);

  if (result.matchedCount === 0) {
  // Extremely unlikely given the earlier read, but guard anyway.
  return { error: `Event with ID '${event}' not found (update failed).` };
  }

  return {};
  } catch (e) {
  console.error("Error editing event:", e);
  return { error: "Failed to edit event due to a database error." };
  }
  }

/\*\*

* creates a new event, exactly the same as the requested event
*
* @requires the event you want to duplicate exists
* @effects duplicated the event exactly as it is, and returns the id
* ```
       of the new event
  ```
*
* @param event - The ID of the event to duplicate.
*
* @returns the ID of the new, duplicated event on success, or an error message.
  \*/
  async duplicateEvent(
  event: EventID
  ): Promise<{ duplicateEvent: EventID } | { error: string }> {
  // Requires: event exists
  try {
  const existingEvent = await this.events.findOne({ \_id: event });

  if (!existingEvent) {
  return { error: `Event with ID '${event}' not found.` };
  }

  // Create a new event document, copying all fields but generating a fresh ID
  const newEvent: Event = {
  ...existingEvent,
  \_id: freshID(), // New unique ID for the duplicate
  };

  await this.events.insertOne(newEvent);

  return { duplicateEvent: newEvent.\_id };
  } catch (e) {
  console.error("Error duplicating event:", e);
  return { error: "Failed to duplicate event due to a database error." };
  }
  }

/\*\*

* Gets all of the objects on a given day
*
* @requires day, month, and year are all valid
* @effects returns all of the events that fall on that day
*
* @param day - Day of month (1-31)
* @param month - Month (1-12)
* @param year - Full year (e.g. 2025)
*
* @returns an array of events that occur on the specified day or an error message.
  \*/
  async getEventsByDate(
  day: number,
  month: number,
  year: number,
  teamId: ID
  ): Promise<{ events: Event\[] } | { error: string }> {
  // Basic parameter validation
  if (
  !Number.isInteger(day) ||
  !Number.isInteger(month) ||
  !Number.isInteger(year)
  ) {
  return { error: "day, month and year must be integers." };
  }

```
// Construct the start and end of the requested day in local time
```

```
const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

// Validate that the date components did not roll over (e.g., invalid day like Feb 30)
if (
  startOfDay.getFullYear() !== year ||
  startOfDay.getMonth() !== month - 1 ||
  startOfDay.getDate() !== day
) {
  return { error: `Invalid date: ${year}-${month}-${day}` };
}

try {
  // Find events that overlap the requested day: startTime <= endOfDay AND endTime >= startOfDay
  const events = await this.events
    .find({
      teamId,
      startTime: { $lte: endOfDay },
      endTime: { $gte: startOfDay },
    })
    .toArray();

  return { events };
} catch (e) {
  console.error("Error querying events by date:", e);
  return { error: "Failed to query events due to a database error." };
}
```

}
}

import { Collection, Db } from "npm:mongodb";
import { google } from "googleapis";
import type { Auth } from "googleapis";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { User } from "../UserDirectory/UserDirectoryConcept.ts";
import { type Event } from "../CalanderEvent/CalanderEventConcept.ts";

const PREFIX = "Notifications.";

type NotificationID = ID;

interface NotificationDoc {
\_id: NotificationID;
sender: User;
recipients: User\[];
events: Event\[];
messageEmail: string; // list of events + appended additional message
scheduledAt: Date;
createdAt: Date;
}

function base64Url(raw: string): string {
const bytes = new TextEncoder().encode(raw);
let bin = "";
for (const b of bytes) bin += String.fromCharCode(b);
const b64 = btoa(bin);
return b64.replace(/+/g, "-").replace(///g, "\_").replace(/=+$/g, "");
}

function formatDate(d?: Date) {
if (!d) return "";

const months = \[
"Jan",
"Feb",
"Mar",
"Apr",
"May",
"Jun",
"Jul",
"Aug",
"Sep",
"Oct",
"Nov",
"Dec",
];
const days = \["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const month = months\[d.getMonth()];
const day = d.getDate();
const year = d.getFullYear();
const dayOfWeek = days\[d.getDay()];

let hours = d.getHours();
const minutes = d.getMinutes().toString().padStart(2, "0");
const ampm = hours >= 12 ? "PM" : "AM";
hours = hours % 12 || 12;

return `${dayOfWeek}, ${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
}

function composeMessage(events: Event\[], additionalMessage: string) {
const lines: string\[] = \[];
lines.push("Upcoming items:");
for (const e of events) {
const parts = \[
e.title || "Untitled",
e.startTime
? `🗓 ${formatDate(e.startTime)}–${formatDate(e.endTime)}`
: undefined,
e.location ? `📍 ${e.location}` : undefined,
e.description ? `— ${e.description}` : undefined,
e.link ? `🔗 ${e.link}` : undefined,
].filter(Boolean);
lines.push(`• ${parts.join("  |  ")}`);
}
if (additionalMessage?.trim()) {
lines.push("", additionalMessage.trim());
}

return lines.join("\n");
}

export default class NotificationsConcept {
private notifications: Collection<NotificationDoc>;
private gmail;

constructor(
private readonly db: Db,
private readonly oauth: Auth.OAuth2Client, // already configured with gmail.send scope
private readonly subject: string = "Team Updates" // minimal, fixed subject,
) {
this.notifications = db.collection<NotificationDoc>(
`${PREFIX}notifications`
);
// Initialize Gmail API client without auth to avoid TS overload mismatch; pass auth per request
this.gmail = google.gmail({ version: "v1", auth: this.oauth });
}

/\*\*

* Creates a new notification
*
* @requires scheduledAt >= now
* @effects creates new Notification with the recipients, scheduled at
* ```
       the schedule time, makes the events into a message in list
  ```
* ```
       format giving the date/time, location, description, and/or
  ```
* ```
       link and additionally appends the additional message at the
  ```
* ```
       bottom of the events lists.
  ```
*
* @param sender
* @param recipients
* @param events
* @param additionalMessage
* @param scheduledAt
* @returns
  \*/
  async create(
  sender: User,
  recipients: User\[],
  events: Event\[],
  additionalMessage: string,
  scheduledAt: Date
  ): Promise<{ id?: NotificationID; error?: string }> {
  // scheduledAt in future
  if (scheduledAt.getTime() < Date.now()) {
  return { error: "scheduledAt must be in the future." };
  }

```
const messageEmail = composeMessage(events, additionalMessage);
```

```
const doc: NotificationDoc = {
  _id: freshID() as NotificationID,
  sender,
  recipients,
  events,
  messageEmail,
  scheduledAt,
  createdAt: new Date(),
};

await this.notifications.insertOne(doc);
return { id: doc._id };
```

}

/\*\*

* @requires editor is sender
* @requires notification exists
* @effects adds event to the notification and edits the message to have the event
*
* @param editor the id of the coach to edit the notification
* @param event the id of the event to add to the notification
* @param Notification the notification the editor wants to edit
*
* @returns
  \*/
  async addEvent(
  editor: User,
  event: Event,
  notification: NotificationID
  ): Promise\<Empty | { error: string }> {
  //notification exists
  const notificationObject = await this.notifications.findOne({
  \_id: notification,
  });
  if (!notificationObject) return { error: "Notification does not exist." };

```
//editor is sender
```

```
if (notificationObject.sender._id !== editor._id) {
  return { error: "Only the sender can edit the notification." };
}

// Preserve the extra message by extracting anything after a blank line (if present
const parts = notificationObject.messageEmail.split("\n\n");
const additional = parts.length > 1 ? parts.slice(-1)[0] : "";

const allEvents = [...notificationObject.events, event];
const newMessage = composeMessage(allEvents, additional);

await this.notifications.updateOne(
  { _id: notification },
  { $set: { events: allEvents, messageEmail: newMessage } }
);

return {};
```

}

/\*\*

* Sends the notification to the recipients gmails from the coaches gmails
*
* @requires notification exists
*
* @param sender the id of the user sending the email
* @param notification the notification id you want to send
* @returns
  \*/
  async send(notification: NotificationID): Promise\<Empty | { error: string }> {
  const notificationObject = await this.notifications.findOne({
  \_id: notification,
  });
  if (!notificationObject) return { error: "Notification does not exist." };

```
const sender = notificationObject.sender;
```

```
if (!sender) return { error: "Sender does not exist." };
const senderGmail = sender.email;
if (!senderGmail) return { error: "Sender does not have a gmail." };

// get recipient emails (use UserDirectoryConcept.getUser for each recipient)
const to: string[] = [];
for (const user of notificationObject.recipients) {
  if (user.email) to.push(user.email);
}
if (to.length === 0) return { error: "No recipient emails found." };

const headers =
  `From: ${senderGmail}\r\n` +
  `To: ${to.join(", ")}\r\n` +
  `Subject: ${this.subject}\r\n` +
  "MIME-Version: 1.0\r\n" +
  'Content-Type: text/plain; charset="UTF-8"\r\n' +
  "Content-Transfer-Encoding: 7bit\r\n\r\n";

const raw = base64Url(headers + notificationObject.messageEmail);

try {
  await this.gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return {};
} catch (e) {
  return {
    error: e instanceof Error ? e.message : "Failed to send email.",
  };
}
```

}
}

import { Collection, Db } from "mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { User } from "../UserDirectory/UserDirectoryConcept.ts";

const PREFIX = "TeamMembership" + ".";

export type TeamID = ID;

export interface Team {
\_id: TeamID;
name: string;
passKey: string;
coach: User;
athletes: User\[];
}

/\*\*

* @concept TeamMembership
* @purpose Organize teams and their membership so coaches can create teams and athletes can join them.
* @principle After a coach creates a team with a unique name and passKey,
* ```
         athletes who know the passKey can join the team and remain members until they leave.
  ```

\*/
export default class TeamMembershipConcept {
private teams: Collection<Team>;

constructor(private readonly db: Db) {
this.teams = this.db.collection(PREFIX + "teams");
}

/\*\*

* Makes a new team
*
* @requires  No team with this name exists
* @requires the coach does not coach another team
* @effects Generates a new team object with the provided title, coach, and passKey.
* ```
       The new team initially has an empty list of athletes.
  ```
*
* @param title  The desired name for the new team.
* @param coach The user who will coach this team.
* @param passKey The passKey required for athletes to join the team.
*
* @returns The ID of the new team on success
  \*/

async createTeam(
title: string,
coach: User,
passKey: string
): Promise<{ newTeam: Team } | { error: string }> {
// verify the coach does not already coach another team
const existingCoachTeam = await this.teams.findOne({
"coach.\_id": coach.\_id,
});
if (existingCoachTeam) {
return {
error: `User with userId: ${coach} already coaches team "${existingCoachTeam.name}"`,
};
}

```
// verify team does not exist
const existingTeam = await this.teams.findOne({ name: title });

if (existingTeam) {
  return { error: `Team with name "${title}" already exists.` };
}

//generate the new team
const newTeamID = freshID() as TeamID;

const newTeam: Team = {
  _id: newTeamID,
  name: title,
  coach: coach,
  passKey: passKey,
  athletes: [], // New teams start with no athletes
};

await this.teams.insertOne(newTeam);
return { newTeam: newTeam };
```

}

/\*\*

* Adds an athlete to the team
*
* @requires Team exists with this title
* @requires passKey matches team's passKey.
* @requires Athlete is not already a member of the team.
* @effects Adds the athlete's to the team's 'athletes' set.
*
* @param title The name of the team to which the athlete will be added.
* @param athlete The athlete to add.
* @param passKey The passKey required to join the team.
*
* @returns An empty object on success, or an error message.
  \*/

async addAthlete(
title: string,
athlete: User,
passKey: string
): Promise\<Empty | { error: string }> {
//verify the team exists
const team = await this.teams.findOne({ name: title });

```
if (!team) {
  return { error: `Team with name "${title}" not found.` };
}

// verify the passkey for the team is correct
if (team.passKey !== passKey) {
  return { error: "Invalid passKey for this team." };
}

// verify the athlete is not already on this team (compare by _id)
if (team.athletes.some((a) => a._id === athlete._id)) {
  return { error: `Athlete ${athlete} is already a member of "${title}"` };
}

//add athlete to team
await this.teams.updateOne(
  { _id: team._id },
  { $addToSet: { athletes: athlete } }
);

return {};
```

}

/\*\*

* Remove an athlete from a team
*
* @requires Team exists with this title.
* @requires Athlete is currently a member of the team.
* @effects Removes the athlete from the team's 'athletes' set.
*
* @param title The name of the team from which the athlete will be removed.
* @param athlete The athlete to remove.
*
* @returns An empty object on success, or an error message.
  \*/
  async removeAthlete(
  title: string,
  athlete: User
  ): Promise\<Empty | { error: string }> {
  //verify the team exists
  const team = await this.teams.findOne({ name: title });

```
if (!team) {
```

```
  return { error: `Team with name "${title}" not found.` };
}

// verify the athlete is currently part of the team (compare by _id)
console.log("team.athletes:", team.athletes);
if (!team.athletes.some((a) => a._id === athlete._id)) {
  return {
    error: `Athlete ${athlete} is not a member of team "${title}".`,
  };
}

//remove the athelte
await this.teams.updateOne(
  { _id: team._id },
  { $pull: { athletes: { _id: athlete._id } } } // remove by matching nested _id
);

return {};
```

}

/\*\*

* Gets the team based on the coach
*
* @requires the coach has a team
* @effects returns the team the coach coaches
*
* @param coachId The coach.
* @returns An array of all teams by the given user.
  \*/
  async getTeamByCoach(coachId: User): Promise\<Team | { error: string }> {
  const team = await this.teams.findOne({ "coach.\_id": coachId.\_id });
  if (!team) {
  return { error: `Coach ${coachId} does not have a team` };
  }
  return team;
  }

/\*\*

* Gets the team that the current athlete belongs to
*
* @requires the athlete is a part of a team
* @effects returns the team the athlete is a part of
*
* @param athleteId a valid userId that belongs to the athlete you are querying for
* @returns the teamt the athlete belongs to
  \*/
  async getTeamByAthlete(athleteId: User): Promise\<Team | { error: string }> {
  // get the team by nested athlete \_id
  const team = await this.teams.findOne({ "athletes.\_id": athleteId.\_id });
  if (!team) {
  return { error: `Athlete ${athleteId} does not belong to a team` };
  }
  return team;
  }

/\*\*

* Gets the athletes in a given team by team id
*
* @requires the team exists
* @effects returns the athletes on that team
*
* @param teamId - The id of the team.
* @returns A list of athlete IDs in the team, or an error.
  \*/
  async getAthletesByTeam(teamId: TeamID): Promise\<User\[] | { error: string }> {
  const team = await this.teams.findOne({ \_id: teamId });

```
if (!team) {
```

```
  return { error: `Team with id "${teamId}" not found.` };
}

return team.athletes;
```

}
}

import { Collection, Db } from "mongodb";
import { ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import UserDirectoryConcept, {
User,
UserID,
} from "../UserDirectory/UserDirectoryConcept.ts";

export interface AthleteData {
id: ID;
athlete: User;
day: Date;
mileage?: number;
stress?: number; // 1-10 scale
sleep?: number; // hours
restingHeartRate?: number; // resting heart rate in bpm
exerciseHeartRate?: number; // exercise heart rate in bpm
perceivedExertion?: number; // 1-10 scale
notes?: string;
}

export interface ComparisonMetrics {
averageActivityMetric: number | null;
trendDirection: "up" | "down" | "flat";
}

export interface WeeklySummary {
athlete: User;
weekStart: Date;
mileageSoFar: number;
averageStress: ComparisonMetrics;
averageSleep: ComparisonMetrics;
averageRestingHeartRate: ComparisonMetrics;
averageExerciseHeartRate: ComparisonMetrics;
averagePerceivedExertion: ComparisonMetrics;
athleteDataDailyCollectionForWeek: AthleteData\[];
}

const PREFIX = "TrainingRecords" + ".";

///// WEEKLY SUMMARY HELPER FUNCTIONS
function atMidnight(d: Date): Date {
const x = new Date(d);
x.setHours(0, 0, 0, 0);
return x;
}

// Helper to parse a date string (YYYY-MM-DD) in local timezone
function parseLocalDate(dateStr: string): Date {
const \[year, month, day] = dateStr.split("-").map(Number);
return new Date(year, month - 1, day, 0, 0, 0, 0);
}

// Format a Date as local YYYY-MM-DD
function toLocalYMD(date: Date): string {
const y = date.getFullYear();
const m = String(date.getMonth() + 1).padStart(2, "0");
const d = String(date.getDate()).padStart(2, "0");
return `${y}-${m}-${d}`;
}

function sundayOf(d: Date): Date {
const x = atMidnight(d);
const day = x.getDay(); // 0 = Sun
const out = new Date(x);
out.setDate(x.getDate() - day);
return out;
}
function nextSunday(startSunday: Date): Date {
const out = new Date(startSunday);
out.setDate(out.getDate() + 7);
return out;
}

export function calculateMetrics(
data: AthleteData\[],
fields: (keyof AthleteData)\[]
): { totalMileage: number; averages: Record\<string, number | null> } {
let totalMileage = 0;
const sums: Record\<string, number> = {};
const counts: Record\<string, number> = {};

for (const field of fields) {
sums\[field as string] = 0;
counts\[field as string] = 0;
}

for (const record of data) {
if (record.mileage !== undefined) {
totalMileage += record.mileage;
}
for (const field of fields) {
const value = record\[field as keyof AthleteData];
if (typeof value === "number" && value !== null && !isNaN(value)) {
sums\[field as string] += value;
counts\[field as string]++;
}
}
}

const averages: Record\<string, number | null> = {};
for (const field of fields) {
averages\[field as string] =
counts\[field as string] > 0
? sums\[field as string] / counts\[field as string]
: null;
}

return { totalMileage, averages };
}

export function compareAverages(
currentAvg: number | null,
prevAvg: number | null
): ComparisonMetrics {
if (currentAvg === null && prevAvg === null) {
return { averageActivityMetric: null, trendDirection: "flat" };
}
if (currentAvg === null) {
// Prev exists, current doesn't
return { averageActivityMetric: null, trendDirection: "down" };
}
if (prevAvg === null) {
// Current exists, prev doesn't
return { averageActivityMetric: currentAvg, trendDirection: "up" };
}

// Both averages exist, compare them
// Define a small tolerance for "flat" to avoid micro-changes causing trends
const tolerance = 0.01;

const diff = currentAvg - prevAvg;

const trend: "up" | "down" | "flat" =
Math.abs(diff) < tolerance ? "flat" : diff > 0 ? "up" : "down";

return { averageActivityMetric: currentAvg, trendDirection: trend };
}

export default class TrainingRecordsConcept {
private weeklyRecords: Collection<WeeklySummary>;
private athleteData: Collection<AthleteData>;
private users: Collection<User>;

constructor(private readonly db: Db) {
this.weeklyRecords = this.db.collection<WeeklySummary>(
PREFIX + "weeklyRecords"
);
this.athleteData = this.db.collection<AthleteData>(PREFIX + "athleteData");
this.users = this.db.collection<User>("UserDirectory.users");

```
// Helpful indexes
void this.athleteData.createIndex(
  { "athlete._id": 1, day: 1 },
  { unique: true }
);
```

}

/\*\*

* @requires all logs are valid keys
* @effects edits or logs an athlete's data from that day with the corresponding log values
*
* @param date The date of the log entry
* @param athlete The athlete object
* @param logValues The values to log (partial AthleteData without athleteId and day)
*
* @returns The updated or created AthleteData entry, or an error message
  \*/
  async logData(
  date: Date,
  athlete: User,
  logValues: Partial\<Omit\<AthleteData, "athlete" | "day">>
  ): Promise\<AthleteData | { error: string }> {
  //validate all log values are valid keys
  const validKeys: (keyof Omit\<AthleteData, "athlete" | "day">)\[] = \[
  "mileage",
  "stress",
  "sleep",
  "restingHeartRate",
  "exerciseHeartRate",
  "perceivedExertion",
  "notes",
  ];
  for (const key of Object.keys(logValues)) {
  if (
  !validKeys.includes(key as keyof Omit\<AthleteData, "athlete" | "day">)
  ) {
  return { error: `Invalid log key: ${key}` };
  }
  }

```
// Filter out null and undefined values - only update fields with actual values
```

```
const filteredValues: Record<string, number | string> = {};
for (const [key, value] of Object.entries(logValues)) {
  if (value !== null && value !== undefined) {
    filteredValues[key] = value as number | string;
  }
}

const day = atMidnight(date);

// Check if an entry already exists for this athlete and day
const existingEntry = await this.athleteData.findOne({
  "athlete._id": athlete._id,
  day: day,
});

if (existingEntry) {
  // Only update if there are values to set
  if (Object.keys(filteredValues).length > 0) {
    await this.athleteData.updateOne(
      { _id: existingEntry._id },
      { $set: filteredValues }
    );
  } else {
    console.log("No values to update for existing entry on:", day);
  }

  // Fetch and return the updated entry from database
  const updatedEntry = await this.athleteData.findOne({
    _id: existingEntry._id,
  });
  if (!updatedEntry) {
    return { error: "Failed to retrieve updated entry." };
  }
  return updatedEntry;
} else {
  // Create a new entry
  const newEntry: AthleteData = {
    id: freshID(),
    athlete: athlete,
    day: day,
    ...filteredValues,
  };
  await this.athleteData.insertOne(newEntry);

  // Fetch and return the newly created entry from database
  const createdEntry = await this.athleteData.findOne({
    "athlete._id": athlete._id,
    day: day,
  });
  if (!createdEntry) {
    return { error: "Failed to retrieve created entry." };
  }
  console.log("Created entry:", createdEntry);
  return createdEntry;
}
```

}

/\*\*

* HTTP-friendly wrapper: log an entry for a user by ID
* Expects body: { userId: string, date: string|Date, mileage?, stress?, sleep?, restingHeartRate?, exerciseHeartRate?, perceivedExertion?, notes? }
  \*/
  async logDailyEntry(input: {
  userId?: UserID;
  date?: string | Date;
  mileage?: number;
  stress?: number;
  sleep?: number;
  restingHeartRate?: number;
  exerciseHeartRate?: number;
  perceivedExertion?: number;
  notes?: string;
  }): Promise\<AthleteData | { error: string }> {
  try {
  const userId = input.userId;
  if (!userId) return { error: "Missing userId." };

  // Parse date properly - if it's a string in YYYY-MM-DD format, use parseLocalDate
  let date: Date | undefined;
  if (input.date) {
  if (typeof input.date === "string") {
  date = parseLocalDate(input.date);
  } else {
  date = new Date(input.date);
  }
  }

  if (!date || isNaN(date.getTime()))
  return { error: "Invalid or missing date." };

  const athlete = await this.users.findOne({ \_id: userId });
  if (!athlete) return { error: "User not found." };

  // Extract all the log values (everything except userId and date)
  const { userId: \_, date: \_\_, ...logValues } = input;

  return await this.logData(date, athlete, logValues);
  } catch (e) {
  console.error("logDailyEntry failed:", e);
  return { error: "Failed to log entry." };
  }
  }

/\*\*

* HTTP-friendly: list entries for a user, optional date range
* Expects input: { userId: string, from?: string|Date, to?: string|Date }
  \*/
  async listEntries(input: {
  userId?: UserID;
  from?: string | Date;
  to?: string | Date;
  }): Promise<{ entries: AthleteData\[] } | { error: string }> {
  try {
  const userId = input.userId;
  if (!userId) return { error: "Missing userId." };

  const athlete = await this.users.findOne({ \_id: userId });
  if (!athlete) return { error: "User not found." };
  // Build the query
  const query: {
  "athlete.\_id": UserID;
  day?: { $gte?: Date; $lt?: Date };
  } = { "athlete.\_id": userId };

  // Add date range if provided
  if (input.from || input.to) {
  query.day = {};

  if (input.from) {
  const fromDate = new Date(input.from);
  if (!isNaN(fromDate.getTime())) {
  query.day.$gte = atMidnight(fromDate);
  }
  }

  if (input.to) {
  const toDate = new Date(input.to);
  if (!isNaN(toDate.getTime())) {
  const exclusiveEnd = atMidnight(toDate);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
  query.day.$lt = exclusiveEnd;
  }
  }
  }

  const entries = await this.athleteData
  .find(query)
  .sort({ day: 1 })
  .toArray();

  console.log("these are the listed entries:", entries);
  return { entries };
  } catch (e) {
  console.error("listEntries failed:", e);
  return { error: "Failed to list entries." };
  }
  }

/\*\*

* Creates a weekly summary for the given athlete without the AI recommendation.
*
* @requires there is athlete data for the week
* @effects uses todaysDate to find the week sunday-saturday that the
* ```
       week falls in and acquires all of the athletes datas from
  ```
* ```
       that week and the week prior and calculates averages and
  ```
* ```
       changes from the previous week and generates a weekly summary
  ```
* ```
       without the ai recomendation yet
  ```
*
* @param requester - The ID of the requester (coach)
* @param athlete - The ID of the athlete
* @param todaysDate - The current date
*
* @returns A promise that resolves to the weekly summary or an error message
  \*/
  async createWeeklySummary(
  athlete: User,
  todaysDate: Date
  ): Promise\<WeeklySummary | { error: string }> {
  //find the week range (sunday-saturday) for todaysDate
  console.log(athlete.name);
  // Normalize todaysDate to local midnight to avoid TZ drift
  const todayLocal = parseLocalDate(toLocalYMD(todaysDate));
  const weekStart = sundayOf(todayLocal); // inclusive
  const weekEndExcl = nextSunday(weekStart);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEndExcl = weekStart;

```
const athleteId = String(athlete._id);
```

```
console.log(
  "createWeeklySummary athleteId:",
  athleteId,
  "week:",
  weekStart,
  "..",
  weekEndExcl
);

// Fetch current week's data from the database
const currentWeekData = await this.athleteData
  .find({
    "athlete._id": { $in: [athlete._id as unknown as string, athleteId] },
    day: { $gte: weekStart, $lt: weekEndExcl },
  })
  .sort({ day: 1 })
  .toArray();
console.log("Current week data:", currentWeekData);

if (currentWeekData.length === 0) {
  return { error: "No athlete data found for the current week." };
}

// Fetch previous week's data from the database
const prevWeekData = await this.athleteData
  .find({
    "athlete._id": { $in: [athlete._id as unknown as string, athleteId] },
    day: { $gte: prevWeekStart, $lt: prevWeekEndExcl },
  })
  .toArray();

const metricFields: (keyof AthleteData)[] = [
  "stress",
  "sleep",
  "restingHeartRate",
  "exerciseHeartRate",
  "perceivedExertion",
];

const currentMetrics = calculateMetrics(currentWeekData, metricFields);
const prevMetrics = calculateMetrics(prevWeekData, metricFields);

// Build the weekly summary
const weeklySummary: WeeklySummary = {
  athlete: athlete,
  weekStart: weekStart,
  mileageSoFar: currentMetrics.totalMileage,
  athleteDataDailyCollectionForWeek: currentWeekData,
  averageStress: compareAverages(
    currentMetrics.averages.stress,
    prevMetrics.averages.stress
  ),
  averageSleep: compareAverages(
    currentMetrics.averages.sleep,
    prevMetrics.averages.sleep
  ),
  averageRestingHeartRate: compareAverages(
    currentMetrics.averages.restingHeartRate,
    prevMetrics.averages.restingHeartRate
  ),
  averageExerciseHeartRate: compareAverages(
    currentMetrics.averages.exerciseHeartRate,
    prevMetrics.averages.exerciseHeartRate
  ),
  averagePerceivedExertion: compareAverages(
    currentMetrics.averages.perceivedExertion,
    prevMetrics.averages.perceivedExertion
  ),
};

try {
  await this.weeklyRecords.updateOne(
    {
      "athlete._id": { $in: [athlete._id as unknown as string, athleteId] },
      weekStart: weekStart,
    },
    { $set: weeklySummary },
    { upsert: true }
  );
} catch (e) {
  console.error("Database error creating weekly summary:", e);
  return {
    error: "Failed to store weekly summary due to a database error.",
  };
}

// Return the generated object
return weeklySummary;
```

}
}

import { Collection, Db} from "mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

const PREFIX = "UserDirectory" + ".";

export type UserID = ID;

export enum Role {
Coach = "coach",
Athlete = "athlete",
}

export enum Gender {
Female = "female",
Male = "male",
}

export type GoogleProfile = {
sub: string;
email: string;
emailVerified: boolean;
name?: string;
picture?: string;
};

export interface User {
\_id: UserID;
email: string;
name?: string | null;
role?: Role | null;
weeklyMileage?: number | null;
gender?: Gender | null;

google?: {
sub: string; // Google stable ID
email: string; // from Google
emailVerified: boolean; // from ID token
name?: string;
} | null;

primaryAuth?: "google";
lastLoginAt?: Date;
}

/\*\*

* @concept UserDirectory
* @purpose Register and manage users of the system with unique emails and roles.
* @principle After a user registers with a role, they can be referenced by other concepts.
  \*/
  export default class UserDirectoryConcept {
  users: Collection<User>;
  // Firebase-only verification; no Google OAuth client needed

constructor(private readonly db: Db, \_opts?: unknown) {
this.users = this.db.collection<User>(PREFIX + "users");

```
void this.users.createIndex({ email: 1 }, { unique: true });
void this.users.createIndex(
  { "google.sub": 1 },
  {
    unique: true,
    partialFilterExpression: { "google.sub": { $exists: true } },
  }
);

// No google-auth-library; we only verify Firebase ID tokens via JWKS
```

}

/\*\*

* Normalizes emails to lowercase + remove white space to prevent duplicates
* @param email (string) valid google email
* @returns the normalized email
*
* ex. Alex@Gmail.com -> alex@gmail.com
  \*/
  private normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
  }

/\*\*

* Verifies the Google ID token inside the concept
*
* @requires valid google idToken
* @effects generates a new/returning user and asserts whether or not they need a role or name
*
* @param idToken (string) google idToken
* @returns
* @userID the new/returning user's id association in the mongo db
* @needsName boolean value of whether the user requires a name to be set
* @neesRole boolean value of whether the user requires a role to be set
  \*/
  async loginWithGoogleIdToken(
  input: string | { idToken?: string }
  ): Promise<
  | { userId: UserID; needsName: boolean; needsRole: boolean }
  | { error: string }

> {
> console.log("inside loginWithGoogleIdToken");
> const idToken = typeof input === "string" ? input : input?.idToken;
> if (!idToken) {
> console.log("Missing idToken.");
> return { error: "Missing idToken." };
> }

```
// Verify Firebase ID token only (no Google OIDC fallback)
const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
if (!firebaseProjectId) {
  console.log("Server missing FIREBASE_PROJECT_ID env var.");
  return { error: "Server missing FIREBASE_PROJECT_ID env var." };
}
try {
  const JWKS = createRemoteJWKSet(
    new URL(
      "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
    )
  );
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${firebaseProjectId}`,
    audience: firebaseProjectId,
  });

  const email = (payload as JWTPayload & { email?: string }).email || "";
  const emailVerified = Boolean(
    (payload as JWTPayload & { email_verified?: boolean }).email_verified
  );
  const name = (payload as JWTPayload & { name?: string }).name;
  const sub = payload.sub as string | undefined;
  if (!sub) {
    console.log("Invalid Firebase token (no sub).");
    return { error: "Invalid Firebase token (no sub)." };
  }
  const profile: GoogleProfile = {
    sub,
    email: this.normalizeEmail(email),
    emailVerified,
    name,
  };
  return this.loginWithGoogle(profile);
} catch (_e) {
  console.log("Firebase ID token verification failed:");
  return { error: "Invalid Firebase ID token." };
}
```

}

/\*\*

* @requires user exists
* @effects gets the user requested
*
* @param userId the id of the user
* @returns the user queried for
  \*/
  async getUser({userId}): Promise\<User | { error: string }> {
  console.log('type of', typeof(userId));
  console.log('user id', userId\['userId']);
  const user = await this.users.findOne({ \_id: userId});
  if (!user) {
  return { error: "this user does not exists" };
  }
  return user;
  }

/\*\*

* Helper function called withing loginWithGoogleIdToken to generate the users profile
*
* @param profile (GoogleProfile) users google profile
* @returns
* @userID the new/returning user's id association in the mongo db
* @needsName boolean value of whether the user requires a name to be set
* @neesRole boolean value of whether the user requires a role to be set
  \*/
  async loginWithGoogle(
  profile: GoogleProfile
  ): Promise<
  | { userId: UserID; needsName: boolean; needsRole: boolean }
  | { error: string }

> {
> console.log("inside loginWithGoogle");
> if (!profile?.sub) return { error: "Missing Google subject (sub)." };
> if (!profile?.email) return { error: "Missing Google email." };
> if (profile.emailVerified !== true)
> return { error: "Google email must be verified." };

```
const now = new Date();
const normalizedEmail = this.normalizeEmail(profile.email);

// 1) Try by google.sub
let user = await this.users.findOne({ "google.sub": profile.sub });

if (!user) {
  // 2) Try by email (in case user existed from import/manual creation)
  user = await this.users.findOne({ email: normalizedEmail });
  if (user) {
    // Attach/link Google identity to existing user
    const update = {
      $set: {
        email: normalizedEmail,
        google: {
          sub: profile.sub,
          email: normalizedEmail,
          emailVerified: true,
          ...(profile.name ? { name: profile.name } : {}),
          ...(profile.picture ? { picture: profile.picture } : {}),
        },
        primaryAuth: "google" as const,
        lastLoginAt: now,
      },
    };

    await this.users.updateOne({ _id: user._id }, update);
    user = { ...user, ...update.$set } as User;
  } else {
    // 3) Create new user document
    const newUser: User = {
      _id: freshID() as UserID,
      email: normalizedEmail,
      name: profile.name ?? null,
      role: null,
      weeklyMileage: null,
      gender: null,
      google: {
        sub: profile.sub,
        email: normalizedEmail,
        emailVerified: true,
        ...(profile.name ? { name: profile.name } : {}),
        ...(profile.picture ? { picture: profile.picture } : {}),
      },
      primaryAuth: "google",
      lastLoginAt: now,
    };

    await this.users.insertOne(newUser);
    user = newUser;
  }
} else {
  // Keep google.sub link; update email if it changed; bump lastLoginAt
  const setDoc: Partial<User> = { lastLoginAt: now };
  if (user.email !== normalizedEmail) setDoc.email = normalizedEmail;

  if (setDoc.email || !user.lastLoginAt) {
    await this.users.updateOne({ _id: user._id }, { $set: setDoc });
    user = { ...user, ...setDoc };
  } else {
    // still bump lastLoginAt even if email unchanged
    await this.users.updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: now } }
    );
    user.lastLoginAt = now;
  }
}

const needsName = !(user.name && user.name.trim().length > 0);
const needsRole = !user.role;

return { userId: user._id, needsName, needsRole };
```

}

/\*\*

* Sets the users name to the new name
*
* @requires user exists with that userID
* @effects user.name = name
*
* @param userId (userID) a userID associated with a current user
* @param name (string) the new name the user wants
  \*/
  async setName(
  userId: UserID,
  name: string
  ): Promise\<Empty | { error: string }> {
  const userName = (name ?? "").trim();
  if (userName.length === 0) return { error: "Name cannot be empty." };

```
const res = await this.users.updateOne(
```

```
  { _id: userId },
  { $set: { name: userName } } // <-- write to 'name' (not 'userName')
);

if (res.matchedCount === 0) return { error: "User not found." };
return {};
```

}

/\*\*

* makes the user either an athlete or a coach
*
* @requires user exists with that userID
* @effects user.role = role
*
* @param userId (UserID) a userID associated with a current user
* @param role (Role) {athlete | coach}
  \*/
  async setRole(
  userId: UserID,
  role: string
  ): Promise\<Empty | { error: string }> {
  // Ensure user exists first
  console.log("Setting role for userId:", userId, "to role:", role);
  const existing = await this.users.findOne({ \_id: userId as UserID });
  if (!existing) {
  return { error: "User not found." };
  }

```
const r = (role || "").toLowerCase();
```

```
if (r !== "athlete" && r !== "coach") {
  return { error: "Invalid role." };
}
const res = await this.users.updateOne(
  { _id: userId },
  { $set: { role: r as Role } }
);
if (res.matchedCount === 0) return { error: "User not found." };
return {};
```

}

/\*\*

* makes the user either an male or female
*
* @requires user exists with that userID
* @effects user.gender = gender
*
* @param userId (UserID) a userID associated with a current user
* @param gender (Role) {male | female}
  \*/
  async setGender(
  userId: UserID,
  gender: Gender
  ): Promise\<Empty | { error: string }> {
  const res = await this.users.updateOne(
  { \_id: userId },
  { $set: { gender } }
  );

```
if (res.matchedCount === 0) return { error: "User not found." };
```

```
return {};
```

}

/\*\*

* sets the weeklyMileage of an ATHLETE
*
* @requires User exists with that user\_id
* @requires user.role = athlete
* @effects user.weeklyMileage = weeklyMileage
*
* @param userId (UserID) a userID associated with a current user that is an athlete
* @param weeklyMileage (number) The weekly mileage to set for the user.
*

\*/
async setWeeklyMileage(
user\_id: UserID,
weeklyMileage: number
): Promise\<Empty | { error: string }> {
const user = await this.users.findOne({ \_id: user\_id as UserID });

```
if (!user) {
  console.log("User not found for ID:", user_id);
  return { error: "User not found." };
}

if (user.role !== Role.Athlete) {
  console.log("User role is not athlete:", user.role);
  return { error: "Only athletes can have weekly mileage set." };
}

try {
  const result = await this.users.updateOne(
    { _id: user_id },
    { $set: { weeklyMileage } }
  );

  if (result.acknowledged && result.modifiedCount === 1) {
    return {};
  } else if (result.acknowledged && result.matchedCount === 0) {
    return {};
  } else {
    return {
      error:
        "Failed to update weekly mileage due to an unknown database error.",
    };
  }
} catch (dbError) {
  console.error("Database error during weekly mileage update:", dbError);
  return {
    error:
      "Failed to update weekly mileage due to a database operation error.",
  };
}
```

}

/\*\*

* Gets the weekly mileage of the athlete
*
* @requires User exists with that user\_id
* @requires user.role = athlete
* @effects returns the users weeklyMileage
*
* @param userId (UserID) a userID associated with a current user that is an athlete
* @returns the weekly mileage of the associated user
  \*/
  async getAthleteMileage(
  user\_id: UserID
  ): Promise<{ weeklyMileage: number | null } | { error: string }> {
  const user = await this.users.findOne({ \_id: user\_id as UserID });

```
if (!user) {
```

```
  return { error: "User not found." };
}

if (user.role !== Role.Athlete) {
  return { error: "Only athletes have weekly mileage." };
}

return { weeklyMileage: user.weeklyMileage ?? null };
```

}

/\*\*

* Gets all of the athletes with that associated gender
*
* @requires there are athletes and athletes with that gender
* @effects returns the athletes with that gender
*
* @paran gender (Gender) {'male' | 'female'} of the athletes you want to get
* @returns a list of users that have that associated gender
  \*/
  async getAthletesByGender(
  gender: Gender
  ): Promise<{ athletes: User\[] } | { error: string }> {
  try {
  const athletes = await this.users
  .find({ role: Role.Athlete, gender: gender })
  .toArray();
  return { athletes };
  } catch (dbError) {
  console.error(
  "Database error during fetching athletes by gender:",
  dbError
  );
  return {
  error: "Failed to fetch athletes due to a database operation error.",
  };
  }
  }

/\*\*

* Gets the role of the user
*
* @requires user with userId exists
* @effects returns the user's role or null if it has not been set yet
*
* @param userId a valid userId
* @returns the role of the user or null if it has not yet been set
  \*/
  async getUserRole(userId: UserID): Promise\<Role | null | { error: string }> {
  const user = await this.users.findOne({ \_id: userId as UserID });

```
if (!user) {
```

```
  return { error: `user with the id ${userId} does not exist.` };
}

const role = user.role;
if (role === undefined) {
  return null;
}

return role;
```

}
}
