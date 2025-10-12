[@concept-design-overview](../../background/concept-design-overview.md)

[@concept-specifications](../../background/concept-specifications.md)

[@implementing-concepts](../../background/implementing-concepts.md)

# implement: Notifications

concept Notifications:
        purpose: Deliver updates and reminders about events, logs, or team activity.
        principle: when key events occur, notifications are generated and queued; recipients are then sent a message at the scheduled time according to their repetition rules

        state:
            a set of Notifications with:
                recipients {Users}
                importantEvents {Event}
                a message String
                a scheduledAt DateTime
                a repetition Enum{Weekly, Monthly, Daily, NonRepeating}
                a status Enum{queued, sent}

        actions:
            create(recipients: {User}, event?: Event, message: String, scheduledAt: DateTime, repetition: Enum)
                requires: recipients exist and scheduledAt ≥ now
                effects: creates new Notification with status = queued
            
            addEvent(event:Event, notification: Notification)
                requires: event exists,  notification exists
                effects: adds event to the notification and edits the message to have the event

            send(notification: Notification)
                requires: the notification’s status = queued and the current time is on or after the notification’s scheduled time
                effects: sets the notification’s status to sent. If the repetition is not NonRepeating, creates a new notification scheduled at the next time according to the repetition rule, with status queued

# response:

Here's the implementation for the `Notifications` concept, following the guidelines and structure provided.

```typescript
// file: src/Notifications/NotificationsConcept.ts

import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

// Declare collection prefix, use concept name
const PREFIX = "Notifications" + ".";

// Generic types of this concept
type User = ID;
type Event = ID;
type NotificationID = ID; // Using a specific type for notification IDs for clarity

/**
 * @enum {string} Defines the repetition rules for notifications.
 */
enum Repetition {
  NonRepeating = "NonRepeating",
  Daily = "Daily",
  Weekly = "Weekly",
  Monthly = "Monthly",
}

/**
 * @enum {string} Defines the possible statuses for a notification.
 */
enum NotificationStatus {
  Queued = "queued",
  Sent = "sent",
}

/**
 * @interface Notifications
 * A set of Notifications with:
 *   recipients {Users}
 *   importantEvents {Event}
 *   a message String
 *   a scheduledAt DateTime
 *   a repetition Enum{Weekly, Monthly, Daily, NonRepeating}
 *   a status Enum{queued, sent}
 */
interface NotificationDocument {
  _id: NotificationID;
  recipients: User[];
  importantEvents: Event[];
  message: string;
  scheduledAt: Date;
  repetition: Repetition;
  status: NotificationStatus;
  createdAt: Date; // Added for auditing/sorting
}

/**
 * concept Notifications
 * purpose: Deliver updates and reminders about events, logs, or team activity.
 * principle: when key events occur, notifications are generated and queued;
 * recipients are then sent a message at the scheduled time according to their repetition rules
 */
export default class NotificationsConcept {
  notifications: Collection<NotificationDocument>;

  constructor(private readonly db: Db) {
    this.notifications = this.db.collection(PREFIX + "notifications");
  }

  /**
   * create(recipients: {User}, event?: Event, message: String, scheduledAt: DateTime, repetition: Enum)
   *   requires: recipients exist and scheduledAt >= now
   *   effects: creates new Notification with status = queued
   */
  async create(
    {
      recipients,
      event,
      message,
      scheduledAt,
      repetition,
    }: {
      recipients: User[];
      event?: Event;
      message: string;
      scheduledAt: Date;
      repetition: Repetition;
    },
  ): Promise<Empty | { error: string; notificationId?: NotificationID }> {
    // requires: recipients exist (interpret as non-empty array)
    if (!recipients || recipients.length === 0) {
      return { error: "Recipients cannot be empty." };
    }

    // requires: scheduledAt >= now
    if (scheduledAt.getTime() < Date.now()) {
      return { error: "Scheduled time must be in the future." };
    }

    const newNotification: NotificationDocument = {
      _id: freshID() as NotificationID,
      recipients: recipients,
      importantEvents: event ? [event] : [],
      message: message,
      scheduledAt: scheduledAt,
      repetition: repetition,
      status: NotificationStatus.Queued,
      createdAt: new Date(),
    };

    // effects: creates new Notification with status = queued
    await this.notifications.insertOne(newNotification);

    return {};
  }

  /**
   * addEvent(event: Event, notificationId: NotificationID)
   *   requires: event exists, notification exists
   *   effects: adds event to the notification and edits the message to have the event
   */
  async addEvent(
    { event, notificationId }: { event: Event; notificationId: NotificationID },
  ): Promise<Empty | { error: string }> {
    // requires: event exists (interpret as event ID provided)
    if (!event) {
      return { error: "Event ID must be provided." };
    }

    // requires: notification exists
    const notification = await this.notifications.findOne({
      _id: notificationId,
    });
    if (!notification) {
      return { error: `Notification with ID ${notificationId} not found.` };
    }

    // effects: adds event to the notification and edits the message to have the event
    // If the event is already present, we don't add it again.
    const updatedEvents = notification.importantEvents.includes(event)
      ? notification.importantEvents
      : [...notification.importantEvents, event];

    // Simple message editing: append event info
    const updatedMessage = notification.message.includes(`(Event: ${event})`)
      ? notification.message
      : `${notification.message} (Event: ${event})`;

    await this.notifications.updateOne(
      { _id: notificationId },
      {
        $set: {
          importantEvents: updatedEvents,
          message: updatedMessage,
        },
      },
    );

    return {};
  }

  /**
   * send(notificationId: NotificationID)
   *   requires: the notification’s status = queued and the current time is on or after the notification’s scheduled time
   *   effects: sets the notification’s status to sent. If the repetition is not NonRepeating,
   *            creates a new notification scheduled at the next time according to the repetition rule, with status queued
   */
  async send(
    { notificationId }: { notificationId: NotificationID },
  ): Promise<Empty | { error: string }> {
    const notification = await this.notifications.findOne({
      _id: notificationId,
    });

    // requires: notification exists
    if (!notification) {
      return { error: `Notification with ID ${notificationId} not found.` };
    }

    // requires: the notification’s status = queued
    if (notification.status !== NotificationStatus.Queued) {
      return {
        error: `Notification with ID ${notificationId} is not in 'queued' status.`,
      };
    }

    // requires: the current time is on or after the notification’s scheduled time
    if (new Date().getTime() < notification.scheduledAt.getTime()) {
      return {
        error:
          `Notification with ID ${notificationId} is not yet scheduled to be sent.`,
      };
    }

    // effects: sets the notification’s status to sent.
    await this.notifications.updateOne(
      { _id: notificationId },
      { $set: { status: NotificationStatus.Sent } },
    );

    // If the repetition is not NonRepeating, creates a new notification
    if (notification.repetition !== Repetition.NonRepeating) {
      let nextScheduledAt: Date;
      const currentScheduled = notification.scheduledAt;

      switch (notification.repetition) {
        case Repetition.Daily:
          nextScheduledAt = new Date(currentScheduled);
          nextScheduledAt.setDate(currentScheduled.getDate() + 1);
          break;
        case Repetition.Weekly:
          nextScheduledAt = new Date(currentScheduled);
          nextScheduledAt.setDate(currentScheduled.getDate() + 7);
          break;
        case Repetition.Monthly:
          nextScheduledAt = new Date(currentScheduled);
          nextScheduledAt.setMonth(currentScheduled.getMonth() + 1);
          // Handle cases like Jan 31 + 1 month. If the day of month overflows, it goes to the next month.
          // We want it to stay in the next month, at its last day.
          if (nextScheduledAt.getDate() !== currentScheduled.getDate()) {
            nextScheduledAt.setDate(0); // Set to the last day of the *previous* month (i.e., the desired month)
          }
          break;
        default:
          // This case should not be reached due to the initial if-condition, but good for safety
          return { error: "Unknown repetition type for new notification." };
      }

      const newRepetitiveNotification: NotificationDocument = {
        _id: freshID() as NotificationID,
        recipients: notification.recipients,
        importantEvents: notification.importantEvents,
        message: notification.message,
        scheduledAt: nextScheduledAt,
        repetition: notification.repetition, // Maintain repetition for the new one
        status: NotificationStatus.Queued, // New notification is queued
        createdAt: new Date(),
      };
      await this.notifications.insertOne(newRepetitiveNotification);
    }

    return {};
  }

  /**
   * _getNotification(notificationId: NotificationID)
   * Query to retrieve a specific notification by its ID.
   */
  async _getNotification(
    { notificationId }: { notificationId: NotificationID },
  ): Promise<NotificationDocument | null> {
    return await this.notifications.findOne({ _id: notificationId });
  }

  /**
   * _getQueuedNotifications(limit: number = 100)
   * Query to retrieve a list of queued notifications that are due to be sent.
   */
  async _getQueuedNotifications(
    { limit }: { limit?: number } = {},
  ): Promise<NotificationDocument[]> {
    const now = new Date();
    return await this.notifications.find({
      status: NotificationStatus.Queued,
      scheduledAt: { $lte: now },
    })
      .sort({ scheduledAt: 1 }) // Oldest first
      .limit(limit || 100)
      .toArray();
  }
}
```