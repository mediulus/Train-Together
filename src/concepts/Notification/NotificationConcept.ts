import { Collection, Db } from "npm:mongodb";
import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import UserDirectoryConcept, {
  Role,
  User,
} from "../UserDirectory/UserDirectoryConcept.ts";
import CalanderEventConcept, {
  type Event,
} from "../CalanderEvent/CalanderEventConcept.ts";
import TeamMembershipConcept, {
  Team,
} from "../TeamMembership/TeamMembershipConcept.ts";

const PREFIX = "Notifications.";

type UserID = ID;
type EventID = ID;
type NotificationID = ID;

interface NotificationDoc {
  _id: NotificationID;
  sender: UserID;
  recipients: UserID[];
  events: EventID[];
  messageEmail: string; // list of events + appended additional message
  scheduledAt: Date;
  createdAt: Date;
}

function base64Url(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function formatDate(d?: Date) {
  return d ? d.toISOString() : "";
}

function composeMessage(events: Event[], additionalMessage: string) {
  const lines: string[] = [];
  lines.push("Upcoming items:");
  for (const e of events) {
    const parts = [
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
  private users: UserDirectoryConcept;
  private events: CalanderEventConcept;
  private teamMembership: TeamMembershipConcept;
  private gmail;

  constructor(
    private readonly db: Db,
    private readonly oauth: OAuth2Client, // already configured with gmail.send scope
    private readonly subject: string = "Team Updates", // minimal, fixed subject,
    teamMembership?: TeamMembershipConcept,
    userDirectory?: UserDirectoryConcept,
    calanderEvent?: CalanderEventConcept,
  ) {
    this.notifications = db.collection<NotificationDoc>(
      `${PREFIX}notifications`,
    );
    this.users = userDirectory ?? new UserDirectoryConcept(db);
    this.events = calanderEvent ?? new CalanderEventConcept(db);
    this.teamMembership = teamMembership ?? new TeamMembershipConcept(db);
    this.gmail = google.gmail({ version: "v1", auth: oauth });
  }

  /**
   * Creates a new notification
   *
   * @requires sender is a coach
   * @requires sender exists
   * @requires recipients exist
   * @requires recipeints are on the same team as coach
   * @requires scheduledAt >= now
   * @requires event exists
   * @effects creates new Notification with the recipients, scheduled at
   *          the schedule time, makes the events into a message in list
   *          format giving the date/time, location, description, and/or
   *          link and additionally appends the additional message at the
   *          bottom of the events lists.
   *
   * @param sender
   * @param recipients
   * @param events
   * @param additionalMessage
   * @param scheduledAt
   * @returns
   */
  async create(
    sender: UserID,
    recipients: UserID[],
    events: EventID[],
    additionalMessage: string,
    scheduledAt: Date,
  ): Promise<{ id?: NotificationID; error?: string }> {
    // sender is coach
    const senderRes = await this.users.getUser(sender);
    if ("error" in senderRes) return { error: senderRes.error };
    const senderDoc = senderRes as User;
    if (senderDoc.role !== Role.Coach) {
      return { error: "Sender must be a coach." };
    }

    // recipients exist (use getUser for each recipient)
    if (!recipients?.length) return { error: "Recipients cannot be empty." };
    const missingRecipients: UserID[] = [];
    for (const r of recipients) {
      const uRes = await this.users.getUser(r);
      if (uRes && typeof uRes === "object" && "error" in uRes) {
        missingRecipients.push(r);
      }
    }
    if (missingRecipients.length > 0) {
      return { error: "One or more recipients do not exist." };
    }

    //recipients are part of the team
    const teamRes = await this.teamMembership.getTeamByCoach(sender);
    if ("error" in teamRes) return { error: teamRes.error };
    const team = teamRes as Team;

    const athletesRes = await this.teamMembership.getAthletesByTeam(team._id);
    if ("error" in athletesRes) return { error: athletesRes.error };
    const athletes = athletesRes as UserID[];

    // Ensure all recipients are members of the coach's team
    const nonMembers = recipients.filter((r) => !athletes.includes(r));
    if (nonMembers.length > 0) {
      return {
        error: "One or more recipients are not members of the coach's team.",
      };
    }
    // events exist (fetch each via CalanderEventConcept.getEvent)
    const evDocs: Event[] = [];
    for (const evId of events) {
      const evRes = await this.events.getEvent(evId);
      if (evRes && typeof evRes === "object" && "error" in evRes) {
        return { error: "One or more events do not exist." };
      }
      evDocs.push(evRes as Event);
    }

    // scheduledAt in future
    if (scheduledAt.getTime() < Date.now()) {
      return { error: "scheduledAt must be in the future." };
    }

    const messageEmail = composeMessage(evDocs, additionalMessage);

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
  }

  /**
   * @requires editor exists
   * @requires editor is a coach
   * @requires event exists
   * @requires notification exists
   * @effects adds event to the notification and edits the message to have the event
   *
   * @param editor the id of the coach to edit the notification
   * @param event the id of the event to add to the notification
   * @param Notification the notification the editor wants to edit
   *
   * @returns
   */
  async addEvent(
    editor: UserID,
    event: EventID,
    notification: NotificationID,
  ): Promise<Empty | { error: string }> {
    //editor exists and is a coach
    const editorRes = await this.users.getUser(editor);
    if ("error" in editorRes) return { error: editorRes.error };
    const editorDoc = editorRes as User;
    if (editorDoc.role !== Role.Coach) {
      return { error: "Editor must be a coach." };
    }

    //events exists
    const evRes = await this.events.getEvent(event);
    if (evRes && typeof evRes === "object" && "error" in evRes) {
      return { error: "Event does not exist." };
    }
    const ev = evRes as Event;

    //notification exists
    const note = await this.notifications.findOne({ _id: notification });
    if (!note) return { error: "Notification does not exist." };

    const newEvents = note.events.includes(event)
      ? note.events
      : [...note.events, event];
    const evDocs: Event[] = [];
    for (const evId of newEvents) {
      const r = await this.events.getEvent(evId);
      if (r && typeof r === "object" && "error" in r) {
        return { error: "One or more events do not exist." };
      }

      //adds the event
      evDocs.push(r as Event);
    }

    // Preserve the extra message by extracting anything after a blank line (if present
    const parts = note.messageEmail.split("\n\n");
    const additional = parts.length > 1 ? parts.slice(-1)[0] : "";

    const newMessage = composeMessage(evDocs, additional);

    await this.notifications.updateOne(
      { _id: notification },
      { $set: { events: newEvents, messageEmail: newMessage } },
    );

    return {};
  }

  /**
   * Sends the notification to the recipients gmails from the coaches gmails
   * 
   * @requires sender exists
   * @requires sender is a coach
   * @requires notification exists
   *
   * @param sender the id of the user sending the email
   * @param notification the notification id you want to send
   * @returns
   */
  async send(sender: UserID, notification: NotificationID,
  ): Promise<Empty | { error: string }> {
    const senderRes = await this.users.getUser(sender);
    if ("error" in senderRes) return { error: senderRes.error };
    const senderDoc = senderRes as User;
    if (senderDoc.role !== Role.Coach) {
      return { error: "Sender must be a coach." };
    }
    if (!senderDoc.email) return { error: "Coach has no email on file." };

    const note = await this.notifications.findOne({ _id: notification });
    if (!note) return { error: "Notification does not exist." };

    // get recipient emails (use UserDirectoryConcept.getUser for each recipient)
    const to: string[] = [];
    for (const rid of note.recipients) {
      const rRes = await this.users.getUser(rid);
      if ("error" in rRes) continue; // skip missing users
      const rDoc = rRes as User;
      if (rDoc.email) to.push(rDoc.email);
    }
    if (to.length === 0) return { error: "No recipient emails found." };

    const headers = `From: ${senderDoc.email}\r\n` +
      `To: ${to.join(", ")}\r\n` +
      `Subject: ${this.subject}\r\n` +
      "MIME-Version: 1.0\r\n" +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      "Content-Transfer-Encoding: 7bit\r\n\r\n";

    const raw = base64Url(headers + note.messageEmail);

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
  }
}
