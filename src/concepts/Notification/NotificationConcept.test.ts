import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  assertSpyCall,
  assertSpyCalls,
  Spy,
  stub,
} from "https://deno.land/std@0.208.0/testing/mock.ts";
import { testDb } from "@utils/database.ts";
import NotificationsConcept from "./NotificationConcept.ts";
import { freshID } from "@utils/database.ts";
import { Role, User } from "../UserDirectory/UserDirectoryConcept.ts";
import { Event } from "../CalanderEvent/CalanderEventConcept.ts";
import type { OAuth2Client } from "google-auth-library";

function fromBase64Url(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}


// Mock implementation for google.gmail and OAuth2Client
const mockOAuth2Client: OAuth2Client = {
  // Minimal properties for the test, `gmail` won't directly use these for sending
} as OAuth2Client;

// Define a type for a partial Gmail client that includes the users.messages.send method
type MockGmailClient = {
  users: {
    messages: {
      send: (
        params: { userId: string; requestBody: { raw: string } },
      ) => Promise<unknown>;
    };
  };
};

let mockGmailSend: any;

// Helper to reset and stub the gmail.users.messages.send method
const setupMockGmailSend = () => {
  // Create an object with a send method to stub
  const gmailMessages = {
    send: (_params: { userId: string; requestBody: { raw: string } }) =>
      Promise.resolve({ data: { id: "mock_message_id" } }),
  };

  // Stub the send method
  mockGmailSend = stub(
    gmailMessages,
    "send",
    () => Promise.resolve({ data: { id: "mock_message_id" } }),
  );

  // Assign the stubbed send method to the mock gmail client structure
  const mockGmailClientInstance: MockGmailClient = {
    users: {
      messages: gmailMessages,
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
  const [db, client] = await testDb();
  let notificationsConcept: NotificationsConcept;
  let mockGmailClientInstance: MockGmailClient;
  notificationsConcept = new NotificationsConcept(db, mockOAuth2Client);
  mockGmailClientInstance = setupMockGmailSend();
  
  // Assign the mock gmail client to the concept instance
  (notificationsConcept as any).gmail = mockGmailClientInstance;
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
    email: "",
    role: Role.Athlete,
  };
  const senderNoEmail: User = {
    _id: freshID(),
    name: "Sender No Email",
    email: "",
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

    const createdNotification = await db.collection(
      "Notifications.notifications",
    ).findOne({ _id: id });
    assertExists(
      createdNotification,
      "Notification should exist in the database.",
    );
    assertEquals(
      createdNotification.sender._id,
      sender._id,
      "Sender should match.",
    );
    assertEquals(
      createdNotification.recipients.length,
      2,
      "Should have 2 recipients.",
    );
    assertEquals(
      createdNotification.events.length,
      1,
      "Should have 1 event initially.",
    );
    assertEquals(
      createdNotification.events[0]._id,
      event1._id,
      "Initial event should match.",
    );
    assertEquals(
      createdNotification.scheduledAt.getTime(),
      scheduledAt.getTime(),
      "Scheduled time should match.",
    );
    assertStringIncludes(
      createdNotification.messageEmail,
      event1.title,
      "Message should contain event title.",
    );
    assertStringIncludes(
      createdNotification.messageEmail,
      additionalMessage,
      "Message should contain additional message.",
    );
    assertStringIncludes(
      createdNotification.messageEmail,
      "Upcoming items:\n• Morning Practice",
      "Message should format events correctly.",
    );
  });

  await t.step(
    "1.1. (Negative) Create notification with scheduledAt in the past",
    async () => {
      const scheduledAt = new Date(Date.now() - 3600 * 1000); // 1 hour ago
      const { id, error } = await notificationsConcept.create(
        sender,
        [recipient1],
        [event1],
        "Test message",
        scheduledAt,
      );

      assertEquals(
        id,
        undefined,
        "Expected no ID to be returned for past scheduledAt.",
      );
      assertExists(error, "Expected an error for past scheduledAt.");
      assertEquals(
        error,
        "scheduledAt must be in the future.",
        "Error message should match.",
      );
    },
  );

  await t.step("2. User adds an event to a notification", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const initialAdditionalMessage = "Initial message.";
    const { id: notificationId, error: createError } =
      await notificationsConcept.create(
        sender,
        [recipient1],
        [event1],
        initialAdditionalMessage,
        scheduledAt,
      );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    // Add a new event
    const { error: addEventError } = await notificationsConcept.addEvent(
      sender,
      event2,
      notificationId,
    );
    assertEquals(
      addEventError,
      undefined,
      `Expected no error, got: ${addEventError}`,
    );

    const updatedNotification = await db.collection(
      "Notifications.notifications",
    ).findOne({ _id: notificationId });
    assertExists(
      updatedNotification,
      "Notification should still exist after adding event.",
    );
    assertEquals(
      updatedNotification.events.length,
      2,
      "Notification should now have 2 events.",
    );
    assertEquals(
      updatedNotification.events[1]._id,
      event2._id,
      "New event should be added.",
    );
    assertStringIncludes(
      updatedNotification.messageEmail,
      event1.title,
      "Message should still contain first event.",
    );
    assertStringIncludes(
      updatedNotification.messageEmail,
      event2.title,
      "Message should contain new event.",
    );
    assertStringIncludes(
      updatedNotification.messageEmail,
      initialAdditionalMessage,
      "Additional message should be preserved.",
    );
  });

  await t.step("2.1. (Negative) Non-sender tries to add an event", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const { id: notificationId, error: createError } =
      await notificationsConcept.create(
        sender,
        [recipient1],
        [event1],
        "Message",
        scheduledAt,
      );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    // Try to add event with a different user
    const { error: addEventError } = await notificationsConcept.addEvent(
      otherUser,
      event2,
      notificationId,
    );
    assertExists(addEventError, "Expected an error for non-sender editing.");
    assertEquals(
      addEventError,
      "Only the sender can edit the notification.",
      "Error message should match.",
    );

    const notificationAfterAttempt = await db.collection(
      "Notifications.notifications",
    ).findOne({ _id: notificationId });
    assertEquals(
      notificationAfterAttempt?.events.length,
      1,
      "Events should not have changed.",
    );
  });

  await t.step(
    "2.2. (Negative) Add event to non-existent notification",
    async () => {
      const nonExistentId = freshID();
      const { error: addEventError } = await notificationsConcept.addEvent(
        sender,
        event2,
        nonExistentId,
      );
      assertExists(
        addEventError,
        "Expected an error for non-existent notification.",
      );
      assertEquals(
        addEventError,
        "Notification does not exist.",
        "Error message should match.",
      );
    },
  );

  await t.step("3. User sends the notification", async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const { id: notificationId, error: createError } =
      await notificationsConcept.create(
        sender,
        [recipient1, recipient2],
        [event1, event2],
        "Final reminder!",
        scheduledAt,
      );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    // Now send the notification
    const { error: sendError } = await notificationsConcept.send(
      notificationId,
    );
    assertEquals(sendError, undefined, `Expected no error, got: ${sendError}`);

    // Verify gmail.users.messages.send was called
    assertSpyCalls(mockGmailSend, 1);
    const call = mockGmailSend.calls[0];
    assertEquals(
      call.args[0].userId,
      "me",
      "send should be called with userId 'me'.",
    );
    assertExists(
      call.args[0].requestBody.raw,
      "send should have a raw email body.",
    );

    const rawEmail = fromBase64Url(call.args[0].requestBody.raw);
    assertStringIncludes(
      rawEmail,
      `From: ${sender.email}`,
      "Raw email should include sender's email.",
    );
    assertStringIncludes(
      rawEmail,
      `To: ${recipient1.email}, ${recipient2.email}`,
      "Raw email should include all recipient emails.",
    );
    assertStringIncludes(
      rawEmail,
      "Subject: Team Updates",
      "Raw email should include the subject.",
    );
    assertStringIncludes(
      rawEmail,
      event1.title,
      "Raw email body should include event 1 title.",
    );
    assertStringIncludes(
      rawEmail,
      event2.title,
      "Raw email body should include event 2 title.",
    );
    assertStringIncludes(
      rawEmail,
      "Final reminder!",
      "Raw email body should include additional message.",
    );
  });

  await t.step("3.1. (Negative) Send non-existent notification", async () => {
    const nonExistentId = freshID();
    const { error: sendError } = await notificationsConcept.send(nonExistentId);
    assertExists(sendError, "Expected an error for non-existent notification.");
    assertEquals(
      sendError,
      "Notification does not exist.",
      "Error message should match.",
    );
  });

  await t.step(
  "3.2. (Negative) Send notification with sender lacking email",
  async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const { id: notificationId, error: createError } =
      await notificationsConcept.create(
        senderNoEmail, // Sender without an email
        [recipient1],
        [event1],
        "Test",
        scheduledAt,
      );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    // 👇 snapshot BEFORE calling send
    const callsBefore = mockGmailSend.calls.length;

    const { error: sendError } = await notificationsConcept.send(notificationId);
    assertExists(sendError, "Expected an error because sender has no email.");
    assertEquals(
      sendError,
      "Sender does not have a gmail.",
      "Error message should match.",
    );

    // 👇 verify no additional send calls were made
    assertEquals(
      mockGmailSend.calls.length,
      callsBefore,
      "gmail send should not be called when sender has no email",
    );
  },
);

  await t.step(
  "3.3. (Negative) Send notification with no valid recipient emails",
  async () => {
    const scheduledAt = new Date(Date.now() + 24 * 3600 * 1000);
    const { id: notificationId, error: createError } =
      await notificationsConcept.create(
        sender,
        [recipientNoEmail], // Recipient without an email
        [event1],
        "Test",
        scheduledAt,
      );
    assertEquals(createError, undefined);
    assertExists(notificationId);

    // 👇 snapshot BEFORE calling send
    const callsBefore = mockGmailSend.calls.length;

    const { error: sendError } = await notificationsConcept.send(notificationId);
    assertExists(
      sendError,
      "Expected an error because no valid recipient emails.",
    );
    assertEquals(
      sendError,
      "No recipient emails found.",
      "Error message should match.",
    );

    // 👇 verify no additional send calls were made
    assertEquals(
      mockGmailSend.calls.length,
      callsBefore,
      "gmail send should not be called when no recipient emails exist",
    );
  },
);
await client.close();
});
