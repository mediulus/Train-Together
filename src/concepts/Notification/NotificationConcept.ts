import { Collection, Db } from "npm:mongodb";
import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import  {Role, User} from "../UserDirectory/UserDirectoryConcept.ts";
import {type Event} from "../CalanderEvent/CalanderEventConcept.ts";

const PREFIX = "Notifications.";

type NotificationID = ID;

interface NotificationDoc {
  _id: NotificationID;
  sender: User;
  recipients: User[];
  events: Event[];
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
  private gmail;

  constructor(
    private readonly db: Db,
    private readonly oauth: OAuth2Client, // already configured with gmail.send scope
    private readonly subject: string = "Team Updates", // minimal, fixed subject,
    ) {
    this.notifications = db.collection<NotificationDoc>(
      `${PREFIX}notifications`,
    );
    this.gmail = google.gmail({ version: "v1", auth: oauth });
  }

  /**
   * Creates a new notification
   *
   * @requires scheduledAt >= now
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
  async create(sender: User, recipients: User[],events: Event[], 
              additionalMessage: string,scheduledAt: Date,): 
                  Promise<{ id?: NotificationID; error?: string }> {

    // scheduledAt in future
    if (scheduledAt.getTime() < Date.now()) {
      return { error: "scheduledAt must be in the future." };
    }

    const messageEmail = composeMessage(events, additionalMessage);

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
   * @requires editor is sender
   * @requires notification exists
   * @effects adds event to the notification and edits the message to have the event
   *
   * @param editor the id of the coach to edit the notification
   * @param event the id of the event to add to the notification
   * @param Notification the notification the editor wants to edit
   *
   * @returns
   */
  async addEvent(editor: User, event: Event, notification: NotificationID): Promise<Empty | { error: string }> {
    //notification exists
    const notificationObject = await this.notifications.findOne({ _id: notification });
    if (!notificationObject) return { error: "Notification does not exist." };

    //editor is sender
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
      { $set: { events: allEvents, messageEmail: newMessage } },
    );

    return {};
  }

  /**
   * Sends the notification to the recipients gmails from the coaches gmails
   * 
   * @requires notification exists
   *
   * @param sender the id of the user sending the email
   * @param notification the notification id you want to send
   * @returns
   */
  async send(notification: NotificationID,
  ): Promise<Empty | { error: string }> {
    const notificationObject = await this.notifications.findOne({ _id: notification });
    if (!notificationObject) return { error: "Notification does not exist." };

    const sender  = notificationObject.sender;
    if (!sender) return { error: "Sender does not exist." };
    const senderGmail = sender.email;
    if (!senderGmail) return { error: "Sender does not have a gmail." };

    // get recipient emails (use UserDirectoryConcept.getUser for each recipient)
    const to: string[] = [];
    for (const user of notificationObject.recipients) {
      if (user.email) to.push(user.email);
    }
    if (to.length === 0) return { error: "No recipient emails found." };

    const headers = `From: ${senderGmail}\r\n` +
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
  }
}
