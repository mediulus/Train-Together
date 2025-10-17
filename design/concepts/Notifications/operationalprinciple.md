
# test: Notification: use the operational principle to test where a user creates a notification with some events and then they add an event to a notification and then they send the notification

## Concept

    concept Notifications:
        purpose: Deliver updates and reminders about events, logs, or team activity.
        principle: A sender creates a notification with certain events, then they add an event to the notification if they want, and then they send the notification!

        state:
            a set of Notifications with:
                a sender User
                recipients {Users}
                events {Event} //these are going to be in a list format in the email
                a messageEmail String //the message that is going to be sent
                a scheduledAt DateTime

        actions:
            create(sender: user, recipients: {User}, events: Event[], additionalMessage: String, scheduledAt: DateTime)
                requires: scheduledAt ≥ now, event exists
                effects: creates new Notification with the recipients, scheduled at the schedule time, makes the events into a message in list format giving the date/time, location, description, and/or link and additionally appends the additional message at the bottom of the events lists. 
            
            addEvent(editor: user, event:Event, notification: Notification)
                requires: 
                    - editor is the sender
                    - notification exists
                effects: adds event to the notification and edits the message to have the event

            send(sender: user, notification: Notification_id)
                requires: notification exists
                effects: emails the message to the gmails of the recipients from the coaches email

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

/**
 * @interface Event
 */
export interface Event {
  _id: EventID;
  startTime: Date;
  endTime: Date;
  location: string;
  title: string;
  description?: string;
  link?: string;
}



# response:


# response:

```typescript
import { assertEquals, assertExists, assertInstanceOf, assertRejects, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { assertSpyCall, assertSpyCalls, Spy, stub } from "https://deno.land/std@0.208.0/testing/mock.ts";
import { FakeMongoClient } from "https://deno.land/x/mongo@v0.32.0/test_deps.ts";
import NotificationsConcept from "./NotificationsConcept.ts";
import { freshID } from "@utils/database.ts";
import { Role, User } from "../UserDirectory/UserDirectoryConcept.ts";
import { Event } from "../CalanderEvent/CalanderEventConcept.ts";
import type { OAuth2Client } from "google-auth-library";

// Mock implementation for google.gmail and OAuth2Client
const mockOAuth2Client: OAuth2Client = {
  // Minimal properties for the test, `gmail` won't directly use these for sending
} as OAuth2Client;

// Define a type for a partial Gmail client that includes the users.messages.send method
type MockGmailClient = {
  users: {
    messages: {
      send: (params: { userId: string; requestBody: { raw: string } }) => Promise<unknown>;
    };
  };
};

let mockGmailSend: Spy<
  (params: { userId: string; requestBody: { raw: string } }) => Promise<unknown>
>;

// Helper to reset and stub the gmail.users.messages.send method
const setupMockGmailSend = () => {
  // Create a mock gmail client object.
  // We'll replace the real google.gmail object during the test run
  // For simplicity, we just need to ensure the `gmail` property on `NotificationsConcept`
  // has a `users.messages.send` method that we can spy on.
  mockGmailSend = stub(
    {}, // This object won't be used, just a placeholder for the spy target
    "send",
    () => Promise.resolve({ data: { id: "mock_message_id" } }),
  );

  // Directly assign the stubbed send method to a mock gmail client structure
  const mockGmailClientInstance: MockGmailClient = {
    users: {
      messages: {
        send: mockGmailSend,
      },
    },
  };

  // Stub the `google.gmail` call itself to return our mock client instance
  // This is a bit tricky as `google` is imported and used directly.
  // For this test, we'll manually assign it within the test setup, or
  // ensure the NotificationsConcept constructor gets our mock.
  // The current `NotificationsConcept` constructor takes `oauth` and internally does `google.gmail({ version: "v1", auth: oauth })`.
  // So, we need to ensure the `oauth` passed to `NotificationsConcept` is correctly handled,
  // or (more easily for testing) directly mock the `this.gmail` property after construction.
  // For this test, the `NotificationsConcept` is constructed with `mockOAuth2Client`.
  // The easiest way to control `this.gmail` is to set it after `NotificationsConcept` is created.
  // We'll manage this in `beforeEach`.
  return mockGmailClientInstance;
};

Deno.test("Notification: user creates a notification with events, adds an event, then sends it", async (t) => {
  const db = new FakeMongoClient().db("test");
  let notificationsConcept: NotificationsConcept;
  let mockGmailClientInstance: MockGmailClient;

  // Mock User objects
  const sender: User = {
    _id: freshID(),
    name: "Coach Example",
    email: "coach@example.com",
    role: Role.Coach,
  };
  const recipient1: User = {
    _id: freshID(),
    name: "Athlete One",
    email: "athlete1@example.com",
    role: Role.Athlete,
  };
  const recipient2: User = {
    _id: freshID(),
    name: "Athlete Two",
    email: "athlete2@example.com",
    role: Role.Athlete,
  };
  const otherUser: User = {
    _id: freshID(),
    name: "Other Coach",
    email: "other@example.com",
    role: Role.Coach,
  };
  const recipientNoEmail: User = {
    _id: freshID(),
    name: "No Email User",
    // No email property
    role: Role.Athlete,
  };
  const senderNoEmail: User = {
    _id: freshID(),
    name: "Sender No Email",
    // No email property
    role: Role.Coach,
  };

  // Mock Event objects
  const event1: Event = {
    _id: freshID(),
    startTime: new Date(Date.now() + 3600 * 1000), // 1 hour from now
    endTime: new Date(Date.now() + 2 * 3600 * 1000), // 2 hours from now
    location: "Track Field",
    title: "Morning Practice",
    description: "Strength and conditioning drills.",
    link: "https://example.com/practice",
  };
  const event2: Event = {
    _id: freshID(),
    startTime: new Date(Date.now() + 2 * 24 * 3600 * 1000), // 2 days from now
    endTime: new Date(Date.now() + 2 * 24 * 3600 * 1000 + 3600 * 1000),
    location: "Gym",
    title: "Team Meeting",
    description: "Discuss upcoming schedule.",
    link: undefined,
  };
  const event3: Event = {
    _id: freshID(),
    startTime: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 1 week from now
    endTime: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 3600 * 1000),
    location: "Cafeteria",
    title: "Team Dinner",
    description: "End of season celebration.",
    link: "https://example.com/dinner",
  };

  t.beforeEach(() => {
    // Clear the fake database before each test
    db.reset();
    notificationsConcept = new NotificationsConcept(db, mockOAuth2Client);
    mockGmailClientInstance = setupMockGmailSend();
    // Manually assign the mock gmail client to the concept instance
    // This circumvents the internal `google.gmail()` call which is hard to stub directly without affecting other modules.
    (notificationsConcept as any).gmail = mockGmailClientInstance.users.messages;
  });

  await t.step("1. User creates a notification with some events", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000); // 1 day from now
    const additionalMessage = "Please bring your own water bottles.";

    const { id, error } = await notificationsConcept.create(
      sender,
      [recipient1, recipient2],
      [event1],
      additionalMessage,
      scheduledAt,
    );

    assertEquals(error, undefined, `Expected no error, got: ${error}`);
    assertExists(id, "Expected a notification ID to be returned.");

    const createdNotification = await db.collection("Notifications.notifications").findOne({ _id: id });
    assertExists(createdNotification, "Notification should exist in the database.");
    assertEquals(createdNotification.sender._id, sender._id, "Sender should match.");
    assertEquals(createdNotification.recipients.length, 2, "Should have 2 recipients.");
    assertEquals(createdNotification.events.length, 1, "Should have 1 event initially.");
    assertEquals(createdNotification.events[0]._id, event1._id, "Initial event should match.");
    assertEquals(createdNotification.scheduledAt.getTime(), scheduledAt.getTime(), "Scheduled time should match.");
    assertStringIncludes(createdNotification.messageEmail, event1.title, "Message should contain event title.");
    assertStringIncludes(createdNotification.messageEmail, additionalMessage, "Message should contain additional message.");
    assertStringIncludes(createdNotification.messageEmail, "Upcoming items:\n• Morning Practice", "Message should format events correctly.");
  });

  await t.step("1.1. (Negative) Create notification with scheduledAt in the past", async () => {
    const scheduledAt = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const { id, error } = await notificationsConcept.create(
      sender,
      [recipient1],
      [event1],
      "Test message",
      scheduledAt,
    );

    assertEquals(id, undefined, "Expected no ID to be returned for past scheduledAt.");
    assertExists(error, "Expected an error for past scheduledAt.");
    assertEquals(error, "scheduledAt must be in the future.", "Error message should match.");
  });

  await t.step("2. User adds an event to a notification", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const initialAdditionalMessage = "Initial message.";
    const { id: notificationId, error: createError } = await notificationsConcept.create(
      sender,
      [recipient1],
      [event1],
      initialAdditionalMessage,
      scheduledAt,
    );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    // Add a new event
    const { error: addEventError } = await notificationsConcept.addEvent(sender, event2, notificationId);
    assertEquals(addEventError, undefined, `Expected no error, got: ${addEventError}`);

    const updatedNotification = await db.collection("Notifications.notifications").findOne({ _id: notificationId });
    assertExists(updatedNotification, "Notification should still exist after adding event.");
    assertEquals(updatedNotification.events.length, 2, "Notification should now have 2 events.");
    assertEquals(updatedNotification.events[1]._id, event2._id, "New event should be added.");
    assertStringIncludes(updatedNotification.messageEmail, event1.title, "Message should still contain first event.");
    assertStringIncludes(updatedNotification.messageEmail, event2.title, "Message should contain new event.");
    assertStringIncludes(updatedNotification.messageEmail, initialAdditionalMessage, "Additional message should be preserved.");
  });

  await t.step("2.1. (Negative) Non-sender tries to add an event", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const { id: notificationId, error: createError } = await notificationsConcept.create(
      sender,
      [recipient1],
      [event1],
      "Message",
      scheduledAt,
    );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    // Try to add event with a different user
    const { error: addEventError } = await notificationsConcept.addEvent(otherUser, event2, notificationId);
    assertExists(addEventError, "Expected an error for non-sender editing.");
    assertEquals(addEventError, "Only the sender can edit the notification.", "Error message should match.");

    const notificationAfterAttempt = await db.collection("Notifications.notifications").findOne({ _id: notificationId });
    assertEquals(notificationAfterAttempt?.events.length, 1, "Events should not have changed.");
  });

  await t.step("2.2. (Negative) Add event to non-existent notification", async () => {
    const nonExistentId = freshID();
    const { error: addEventError } = await notificationsConcept.addEvent(sender, event2, nonExistentId);
    assertExists(addEventError, "Expected an error for non-existent notification.");
    assertEquals(addEventError, "Notification does not exist.", "Error message should match.");
  });

  await t.step("3. User sends the notification", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const { id: notificationId, error: createError } = await notificationsConcept.create(
      sender,
      [recipient1, recipient2],
      [event1, event2],
      "Final reminder!",
      scheduledAt,
    );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    // Now send the notification
    const { error: sendError } = await notificationsConcept.send(notificationId);
    assertEquals(sendError, undefined, `Expected no error, got: ${sendError}`);

    // Verify gmail.users.messages.send was called
    assertSpyCalls(mockGmailSend, 1);
    const call = mockGmailSend.calls[0];
    assertEquals(call.args[0].userId, "me", "send should be called with userId 'me'.");
    assertExists(call.args[0].requestBody.raw, "send should have a raw email body.");

    const rawEmail = atob(call.args[0].requestBody.raw); // Decode base64Url for inspection
    assertStringIncludes(rawEmail, `From: ${sender.email}`, "Raw email should include sender's email.");
    assertStringIncludes(rawEmail, `To: ${recipient1.email}, ${recipient2.email}`, "Raw email should include all recipient emails.");
    assertStringIncludes(rawEmail, "Subject: Team Updates", "Raw email should include the subject.");
    assertStringIncludes(rawEmail, event1.title, "Raw email body should include event 1 title.");
    assertStringIncludes(rawEmail, event2.title, "Raw email body should include event 2 title.");
    assertStringIncludes(rawEmail, "Final reminder!", "Raw email body should include additional message.");
  });

  await t.step("3.1. (Negative) Send non-existent notification", async () => {
    const nonExistentId = freshID();
    const { error: sendError } = await notificationsConcept.send(nonExistentId);
    assertExists(sendError, "Expected an error for non-existent notification.");
    assertEquals(sendError, "Notification does not exist.", "Error message should match.");
  });

  await t.step("3.2. (Negative) Send notification with sender lacking email", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const { id: notificationId, error: createError } = await notificationsConcept.create(
      senderNoEmail, // Sender without an email
      [recipient1],
      [event1],
      "Test",
      scheduledAt,
    );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    const { error: sendError } = await notificationsConcept.send(notificationId);
    assertExists(sendError, "Expected an error because sender has no email.");
    assertEquals(sendError, "Sender does not have a gmail.", "Error message should match.");
    assertSpyCalls(mockGmailSend, 0, "Gmail send should not have been called.");
  });

  await t.step("3.3. (Negative) Send notification with no valid recipient emails", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const { id: notificationId, error: createError } = await notificationsConcept.create(
      sender,
      [recipientNoEmail], // Recipient without an email
      [event1],
      "Test",
      scheduledAt,
    );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    const { error: sendError } = await notificationsConcept.send(notificationId);
    assertExists(sendError, "Expected an error because no valid recipient emails.");
    assertEquals(sendError, "No recipient emails found.", "Error message should match.");
    assertSpyCalls(mockGmailSend, 0, "Gmail send should not have been called.");
  });
});
```