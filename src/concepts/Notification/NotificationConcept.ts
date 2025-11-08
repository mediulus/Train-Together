import { Collection, Db } from "npm:mongodb";
import { google } from "npm:googleapis";
import type { OAuth2Client } from "npm:google-auth-library";
import { Buffer } from "node:buffer";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import type { User } from "../UserDirectory/UserDirectoryConcept.ts";
import type { Event } from "../CalanderEvent/CalanderEventConcept.ts";

const PREFIX = "Notifications.";

export type NotificationID = ID;

/**
 * @interface NotificationDoc
 * State: A notification with sender, recipients, events, and composed message
 */
export interface NotificationDoc {
  _id: NotificationID;
  sender: User;
  recipients: User[];
  events: Event[];
  messageEmail: string; // Formatted list of events + additional message
  createdAt: Date;
}

// Email transport removed in refactor; notifications stored only.

function formatDate(d?: Date) {
  if (!d) return "";

  const months = [
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
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const dayOfWeek = days[d.getDay()];

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${dayOfWeek}, ${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
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

/**
 * concept Notification
 * purpose: Send email notifications about events to team members
 * principle: Create a notification with events and recipients, then send it via email
 */
export default class NotificationsConcept {
  private notifications: Collection<NotificationDoc>;
  private gmail?: ReturnType<typeof google.gmail>;
  private oauth?: OAuth2Client;

  constructor(private readonly db: Db) {
    this.notifications = db.collection<NotificationDoc>(
      `${PREFIX}notifications`
    );
  }

  private base64UrlEncode(str: string) {
    // Always use UTF-8 aware encoding (emoji + punctuation safe)
    const b64 = Buffer.from(str, "utf8").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  private ensureGmail():
    | Promise<Empty | { error: string }>
    | (Empty | { error: string }) {
    if (this.gmail) return {};
    try {
      if (this.oauth) {
        this.gmail = google.gmail({ version: "v1", auth: this.oauth });
        return {};
      }
      // Attempt environment-based initialization (will fail gracefully if missing)
      const getEnv = (k: string) => {
        try {
          // deno-lint-ignore no-explicit-any
          const d = (globalThis as any).Deno;
          if (d?.env?.get) return d.env.get(k) as string | undefined;
        } catch (_e) {
          /* ignore env access errors */
        }
        // deno-lint-ignore no-explicit-any
        const p = (globalThis as any).process;
        return p?.env?.[k] as string | undefined;
      };
      const CLIENT_ID = getEnv("GOOGLE_CLIENT_ID");
      const CLIENT_SECRET = getEnv("GOOGLE_CLIENT_SECRET");
      const REDIRECT_URI =
        getEnv("GOOGLE_REDIRECT_URI") || "urn:ietf:wg:oauth:2.0:oob";
      const REFRESH_TOKEN = getEnv("GOOGLE_REFRESH_TOKEN");
      if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        return {
          error: "Email transport not configured. Missing Gmail OAuth env.",
        };
      }
      // Construct OAuth2 client (cast due to Deno npm interop)
      const OAuth2Ctor = (
        google as unknown as {
          auth: {
            OAuth2: new (
              id: string,
              secret: string,
              uri: string
            ) => OAuth2Client;
          };
        }
      ).auth.OAuth2;
      const oAuth2Client = new OAuth2Ctor(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
      );
      oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
      this.oauth = oAuth2Client;
      this.gmail = google.gmail({ version: "v1", auth: oAuth2Client });
      return {};
    } catch (_e) {
      return { error: "Failed to initialize Gmail client." };
    }
  }

  /**
   * create(sender, recipients, events, additionalMessage)
   *
   * @requires sender, recipients, and events are not empty
   * @effects Creates new Notification with composed message from events + additional text
   *
   * @param params - Object containing sender, recipients, events, additionalMessage
   * @returns { id: NotificationID } or { error: string }
   */
  async create({
    sender,
    recipients,
    events,
    additionalMessage,
  }: {
    sender: User;
    recipients: User[];
    events: Event[];
    additionalMessage: string;
  }): Promise<{ id?: NotificationID; error?: string }> {
    // Validate inputs
    if (!sender) return { error: "Sender is required." };
    if (!recipients || recipients.length === 0) {
      return { error: "At least one recipient is required." };
    }
    if (!events || events.length === 0) {
      return { error: "At least one event is required." };
    }

    // Compose the email message from events and additional message
    const messageEmail = composeMessage(events, additionalMessage || "");

    // Create the notification document
    const doc: NotificationDoc = {
      _id: freshID() as NotificationID,
      sender,
      recipients,
      events,
      messageEmail,
      createdAt: new Date(),
    };

    await this.notifications.insertOne(doc);
    return { id: doc._id };
  }

  /**
   * send(notificationId)
   *
   * @requires notification exists
   * @requires sender has email
   * @requires at least one recipient has email
   * @effects Sends the notification's message via Gmail to all recipients
   *
   * @param params - Object containing notificationId
   * @returns {} or { error: string }
   */
  async send({
    notificationId,
  }: {
    notificationId: NotificationID;
  }): Promise<Empty | { error: string }> {
    // Find the notification
    const notification = await this.notifications.findOne({
      _id: notificationId,
    });
    if (!notification) return { error: "Notification does not exist." };

    const sender = notification.sender;
    if (!sender) return { error: "Sender does not exist." };

    // Initialize Gmail client (will fail gracefully if not configured)
    const init = await this.ensureGmail();
    if ("error" in init) return { error: init.error };
    if (!this.gmail) return { error: "Failed to initialize Gmail client." };

    // Validate sender email
    const senderEmail = (sender.email || "").trim();
    if (!senderEmail) return { error: "Sender does not have an email." };

    // Collect recipient emails
    const recipientEmails = (notification.recipients || [])
      .map((r) => (r.email || "").trim())
      .filter((e) => !!e);
    if (!recipientEmails.length) {
      return { error: "No recipient emails found." };
    }

    // Compose email
    const subject = "Team Updates";
    const body = this.composeHtmlEmail(notification);
    const headers = [
      `From: ${senderEmail}`,
      `To: ${recipientEmails.join(", ")}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
    ];
    const raw = headers.join("\r\n") + body;
    const encoded = this.base64UrlEncode(raw);

    // Send via Gmail
    try {
      await this.gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encoded },
      });
      return {};
    } catch (_e) {
      return { error: "Failed to send email." };
    }
  }

  /**
   * composeHtmlEmail(notification)
   *
   * Generates a pretty HTML email from notification data
   *
   * @param notification - The notification document
   * @returns HTML string
   */
  private composeHtmlEmail(notification: NotificationDoc): string {
    const events = notification.events || [];
    const plainMessage = notification.messageEmail || "";

    // Extract additional message (text after blank line)
    const parts = plainMessage.split("\n\n");
    const additionalMessage = parts.length > 1 ? parts.slice(-1)[0] : "";

    let eventsHtml = "";
    for (const event of events) {
      eventsHtml += `
        <div style="background: #f8f9fa; border-left: 4px solid #4a90e2; padding: 16px; margin: 12px 0; border-radius: 4px;">
          <h3 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 18px;">${
            event.title || "Untitled Event"
          }</h3>
          ${
            event.startTime
              ? `
            <p style="margin: 4px 0; color: #555;">
              <span style="font-weight: 600;">📅 </span>
              ${formatDate(event.startTime)} – ${formatDate(event.endTime)}
            </p>
          `
              : ""
          }
          ${
            event.location
              ? `
            <p style="margin: 4px 0; color: #555;">
              <span style="font-weight: 600;">📍 </span>
              ${event.location}
            </p>
          `
              : ""
          }
          ${
            event.description
              ? `
            <p style="margin: 8px 0 4px 0; color: #666; font-style: italic;">
              ${event.description}
            </p>
          `
              : ""
          }
          ${
            event.link
              ? `
            <p style="margin: 8px 0 0 0;">
              <a href="${event.link}" style="color: #4a90e2; text-decoration: none; font-weight: 600;">
                🔗 Event Link
              </a>
            </p>
          `
              : ""
          }
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Racing+Sans+One&display=swap" rel="stylesheet">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <div style="background: #750014; color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 900; font-family: 'Racing Sans One', cursive, sans-serif; letter-spacing: 1px; text-transform: uppercase;">🏃‍♂️ TrainTogether</h1>
            <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.95;">Team Updates from Your Coach</p>
          </div>
          
          <div style="background: #ffffff; padding: 30px 20px; border: 1px solid #e1e4e8; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #2c3e50; margin-top: 0; font-size: 22px;">Upcoming Events</h2>
            ${eventsHtml}
            
            ${
              additionalMessage.trim()
                ? `
              <div style="margin-top: 24px; padding: 20px; background: #f5f5f5; border-left: 4px solid #9e9e9e; border-radius: 4px;">
                <p style="margin: 0; color: #424242; font-size: 15px; white-space: pre-wrap;">${additionalMessage.trim()}</p>
              </div>
            `
                : ""
            }
            
            <div style="margin-top: 32px; padding-top: 20px; border-top: 2px solid #e1e4e8; text-align: center; color: #6c757d; font-size: 14px;">
              <p style="margin: 0;">Keep training hard! 💪</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
