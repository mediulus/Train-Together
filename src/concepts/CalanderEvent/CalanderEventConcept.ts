import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

const PREFIX = 'CalnderEvent' + "."

type EventID = ID;
type User = ID;

/**
 * @interface Event
 */
interface Event {
  _id: EventID;
  startTime: Date;
  endTime: Date;
  location: string;
  title: string;
  description?: string;
  link?: string;
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
 */
export default class CalanderEventConcept {
  private events: Collection<Event>;

  constructor(private readonly db: Db) {
    this.events = this.db.collection<Event>(PREFIX + "events");
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

  async createEvent(
    {startTime, endTime, location, title, description, link}:
    {creator: User, startTime: Date, endTime: Date,
      location: string, title: string, description? : string,
      link?: string
    }
  ) : Promise<{ event: EventID } | { error: string }> {
    
    if (startTime.getTime() >= endTime.getTime()) {
      return { error: "Event start time must be before end time." };
    }

    const newEvent: Event = {
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
    deleter: User;
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
    editor: User;
    event: EventID;
    updates: Partial<Omit<Event, "_id">>; // Allow partial updates, explicitly disallow changing _id
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
    duplicator: User;
    event: EventID;
  }): Promise<{ duplicateEvent: EventID } | { error: string }> {
    // Requires: event exists
    try {
      const existingEvent = await this.events.findOne({ _id: event });

      if (!existingEvent) {
        return { error: `Event with ID '${event}' not found.` };
      }

      // Create a new event document, copying all fields but generating a fresh ID
      const newEvent: Event = {
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

  /**
   * @action getEventsByDate
   *
   * @param {Object} args - The arguments for querying events by date.
   * @param {number} args.day - Day of month (1-31)
   * @param {number} args.month - Month (1-12)
   * @param {number} args.year - Full year (e.g. 2025)
   *
   * @returns {Promise<{events: Event[]} | {error: string}>} Returns an array of events that occur on the specified day or an error message.
   *
   * Notes: This returns events that overlap any portion of the given day. The implementation
   * uses local timezone (JS Date constructed with year, month-1, day). If you need UTC
   * semantics, convert inputs accordingly before calling.
   */
  async getEventsByDate({ day, month, year }:{ day: number; month: number; year: number; }): Promise<{ events: Event[] } | { error: string }> {
    // Basic parameter validation
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
      return { error: "day, month and year must be integers." };
    }

    // Construct the start and end of the requested day in local time
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    // Validate that the date components did not roll over (e.g., invalid day like Feb 30)
    if (startOfDay.getFullYear() !== year || startOfDay.getMonth() !== month - 1 || startOfDay.getDate() !== day) {
      return { error: `Invalid date: ${year}-${month}-${day}` };
    }

    try {
      // Find events that overlap the requested day: startTime <= endOfDay AND endTime >= startOfDay
      const events = await this.events.find({
        startTime: { $lte: endOfDay },
        endTime: { $gte: startOfDay },
      }).toArray();

      return { events };
    } catch (e) {
      console.error("Error querying events by date:", e);
      return { error: "Failed to query events due to a database error." };
    }
  }

}