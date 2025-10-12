[@concept-design-overview](../../background/concept-design-overview.md)

[@concept-specifications](../../background/concept-specifications.md)

[@implementing-concepts](../../background/implementing-concepts.md)

# implement: CalanderEvent
    concept CalendarEvent:
        purpose: Post and update team events (practices, meets, deadlines).
        principle: When a coach posts or updates an event, all team athletes can view it.

        state:
            a set of Events with:
                a startTime DateTime
                an endTime DateTime
                a location String
                a title String
                a description String
                a link URL

        actions:
            createEvent(creator: String, startTime: DateTime, endTime: DateTime, location: String, title: String, description?: String, link?: URL) : (event: Event)
                requires: user with name = creator exists and has role = coach, startTime < endTime
                effects: generates a new Event with startTime = startTime, endTime = endTime, location = location, title = title and the optional parameters description = description and link = link

            deleteEvent(deleter: String, event: Event)
                requires: user exists with name = deleter and role = coach, and event exists
                effects: deletes the event

            editEvent(editor: String, event: Event, fields..., updateValues...)
                requires: user exists with name = editor and role = coach, and event exists
                effects: updates the event with the given fields and their new values

            duplicateEvent(duplicator: String, event: Event): (duplicateEvent: Event)
                requires: user exists with name = duplicator and role = coach, and event exists
                effects: creates a new event with the same parameters as the inputted event
# response:

To implement the `CalendarEvent` concept following the provided guidelines, we'll create a TypeScript class `CalendarEventConcept`.

First, let's establish the necessary utility types and functions (as described in the "Generic Parameters" and "Initialization" sections). In a real project, these would be imported from `@utils/types.ts` and `@utils/database.ts`. For this example, I'll include their definitions inline for completeness.

```typescript
// --- Simulate @utils/types.ts ---
export type ID = string & { __brand: "ID" };
export type Empty = Record<PropertyKey, never>;

// --- Simulate @utils/database.ts ---
// A simple freshID generation. In a real project, this might use UUIDs or similar.
export function freshID(): ID {
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as ID;
}
// export function getDb(): Promise<[Db, MongoClient]> { /* ... actual implementation ... */ }
// We only need the `Db` instance for the concept's constructor, not the `getDb` function itself in this file.

// --- Actual Concept Implementation ---
import { Collection, Db } from "npm:mongodb"; // Using npm:mongodb for Deno

// Define the prefix for MongoDB collection names for this concept
const PREFIX = "CalendarEvent.";

// Define the generic type parameters and internal ID types
type EventID = ID;
// The concept spec uses `String` for creator/deleter/editor.
// In a fully integrated system, this would likely be an ID referencing a `User` concept.
// For strict adherence to the problem description, we use `string` here.
type UserIdentifier = string; // Represents the `creator`, `deleter`, `editor`, `duplicator` in the actions

/**
 * @interface EventDocument
 * Represents the state of a single event within the CalendarEvent concept.
 * Corresponds to "a set of Events with: a startTime DateTime, an endTime DateTime,
 * a location String, a title String, a description String, a link URL"
 */
interface EventDocument {
  _id: EventID;
  startTime: Date; // Storing DateTime as a Date object, MongoDB handles this natively
  endTime: Date;
  location: string;
  title: string;
  description?: string; // Optional field
  link?: string; // Storing URL as a string, Optional field
}

/**
 * @concept CalendarEvent
 * @purpose Post and update team events (practices, meets, deadlines).
 * @principle When a coach posts or updates an event, all team athletes can view it.
 *
 * This concept manages a collection of calendar events, allowing their creation,
 * deletion, modification, and duplication. It ensures the integrity of event
 * scheduling (e.g., start time before end time) and provides basic query capabilities.
 *
 * Note on `requires` clauses concerning user roles: According to the principles of
 * concept independence and separation of concerns, `CalendarEvent` does not
 * directly implement checks for user existence or roles (e.g., "user has role = coach").
 * These validations would be handled externally by `syncs` with an
 * `Authentication` or `Authorization` concept, which would then conditionally
 * invoke these actions based on the user's permissions. This ensures the `CalendarEvent`
 * concept remains focused solely on event management.
 */
export default class CalendarEventConcept {
  // MongoDB collection to store event documents
  private events: Collection<EventDocument>;

  /**
   * Constructs a new CalendarEventConcept instance.
   * @param db The MongoDB database instance to use for persistent storage.
   */
  constructor(private readonly db: Db) {
    this.events = this.db.collection<EventDocument>(PREFIX + "events");
  }

  /**
   * @action createEvent
   *
   * @param {Object} args - The arguments for creating an event.
   * @param {UserIdentifier} args.creator - The identifier of the user creating the event.
   * @param {Date} args.startTime - The start time of the event.
   * @param {Date} args.endTime - The end time of the event.
   * @param {string} args.location - The physical location of the event.
   * @param {string} args.title - The title of the event.
   * @param {string} [args.description] - An optional detailed description of the event.
   * @param {string} [args.link] - An optional URL link related to the event.
   *
   * @returns {Promise<{event: EventID} | {error: string}>} Returns the ID of the newly created event on success, or an error message.
   *
   * @requires startTime < endTime.
   *           (External: user with name = creator exists and has role = coach)
   * @effects Generates a new Event with the provided details and stores it.
   */
  async createEvent({
    creator, // As per spec, 'creator' is a string. Not used for internal checks.
    startTime,
    endTime,
    location,
    title,
    description,
    link,
  }: {
    creator: UserIdentifier;
    startTime: Date;
    endTime: Date;
    location: string;
    title: string;
    description?: string;
    link?: string;
  }): Promise<{ event: EventID } | { error: string }> {
    // Requires: startTime < endTime
    if (startTime.getTime() >= endTime.getTime()) {
      return { error: "Event start time must be before end time." };
    }

    const newEvent: EventDocument = {
      _id: freshID(), // Generate a new, unique ID for the event
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
  }

  /**
   * @action deleteEvent
   *
   * @param {Object} args - The arguments for deleting an event.
   * @param {UserIdentifier} args.deleter - The identifier of the user deleting the event.
   * @param {EventID} args.event - The ID of the event to delete.
   *
   * @returns {Promise<Empty | {error: string}>} Returns an empty object on success, or an error message.
   *
   * @requires The specified event must exist.
   *           (External: user exists with name = deleter and role = coach)
   * @effects Deletes the event corresponding to the given ID from the state.
   */
  async deleteEvent({
    deleter, // As per spec, 'deleter' is a string. Not used for internal checks.
    event,
  }: {
    deleter: UserIdentifier;
    event: EventID;
  }): Promise<Empty | { error: string }> {
    // Requires: event exists
    try {
      const result = await this.events.deleteOne({ _id: event });

      if (result.deletedCount === 0) {
        return { error: `Event with ID '${event}' not found.` };
      }
      return {};
    } catch (e) {
      console.error("Error deleting event:", e);
      return { error: "Failed to delete event due to a database error." };
    }
  }

  /**
   * @action editEvent
   *
   * @param {Object} args - The arguments for editing an event.
   * @param {UserIdentifier} args.editor - The identifier of the user editing the event.
   * @param {EventID} args.event - The ID of the event to edit.
   * @param {Partial<Omit<EventDocument, "_id">>} args.updates - An object containing fields to update and their new values.
   *
   * @returns {Promise<Empty | {error: string}>} Returns an empty object on success, or an error message.
   *
   * @requires The specified event must exist.
   *           If `startTime` or `endTime` are updated, `startTime < endTime` must still hold.
   *           (External: user exists with name = editor and role = coach)
   * @effects Updates the specified fields of the event with their new values.
   */
  async editEvent({
    editor, // As per spec, 'editor' is a string. Not used for internal checks.
    event,
    updates,
  }: {
    editor: UserIdentifier;
    event: EventID;
    updates: Partial<Omit<EventDocument, "_id">>; // Allow partial updates, explicitly disallow changing _id
  }): Promise<Empty | { error: string }> {
    // Pre-check for existence and validate time integrity if `startTime` or `endTime` are part of updates
    try {
      const existingEvent = await this.events.findOne({ _id: event });

      if (!existingEvent) {
        return { error: `Event with ID '${event}' not found.` };
      }

      // If either startTime or endTime is being updated, validate the new combination
      if (updates.startTime !== undefined || updates.endTime !== undefined) {
        const newStartTime = updates.startTime || existingEvent.startTime;
        const newEndTime = updates.endTime || existingEvent.endTime;

        if (newStartTime.getTime() >= newEndTime.getTime()) {
          return { error: "Updated start time must be before end time." };
        }
      }

      const result = await this.events.updateOne(
        { _id: event },
        { $set: updates },
      );

      if (result.matchedCount === 0) {
        // This case should ideally be caught by findOne above, but as a safeguard
        return { error: `Event with ID '${event}' not found (update failed).` };
      }
      return {};
    } catch (e) {
      console.error("Error editing event:", e);
      return { error: "Failed to edit event due to a database error." };
    }
  }

  /**
   * @action duplicateEvent
   *
   * @param {Object} args - The arguments for duplicating an event.
   * @param {UserIdentifier} args.duplicator - The identifier of the user duplicating the event.
   * @param {EventID} args.event - The ID of the event to duplicate.
   *
   * @returns {Promise<{duplicateEvent: EventID} | {error: string}>} Returns the ID of the new, duplicated event on success, or an error message.
   *
   * @requires The specified event must exist.
   *           (External: user exists with name = duplicator and role = coach)
   * @effects Creates a new event with the same parameters as the inputted event, but with a new unique ID.
   */
  async duplicateEvent({
    duplicator, // As per spec, 'duplicator' is a string. Not used for internal checks.
    event,
  }: {
    duplicator: UserIdentifier;
    event: EventID;
  }): Promise<{ duplicateEvent: EventID } | { error: string }> {
    // Requires: event exists
    try {
      const existingEvent = await this.events.findOne({ _id: event });

      if (!existingEvent) {
        return { error: `Event with ID '${event}' not found.` };
      }

      // Create a new event document, copying all fields but generating a fresh ID
      const newEvent: EventDocument = {
        ...existingEvent,
        _id: freshID(), // New unique ID for the duplicate
      };

      await this.events.insertOne(newEvent);

      return { duplicateEvent: newEvent._id };
    } catch (e) {
      console.error("Error duplicating event:", e);
      return { error: "Failed to duplicate event due to a database error." };
    }
  }

  // --- Concept Queries ---
  // Queries provide read access to the concept's state.
  // They are prefixed with an underscore '_' as per convention.

  /**
   * @query _getEventById
   * @param {Object} args - The arguments for the query.
   * @param {EventID} args.event - The ID of the event to retrieve.
   * @returns {Promise<EventDocument | null>} Returns the event document if found, otherwise null.
   * @effects Retrieves a single event by its unique ID.
   */
  async _getEventById({
    event,
  }: { event: EventID }): Promise<EventDocument | null> {
    return await this.events.findOne({ _id: event });
  }

  /**
   * @query _getAllEvents
   * @returns {Promise<EventDocument[]>} Returns an array of all event documents.
   * @effects Retrieves all events currently stored in the concept's state.
   */
  async _getAllEvents(): Promise<EventDocument[]> {
    return await this.events.find({}).toArray();
  }
}

```