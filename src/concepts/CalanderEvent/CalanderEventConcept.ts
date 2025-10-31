import { Collection, Db } from "mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

const PREFIX = "CalnderEvent" + ".";

type EventID = ID;

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

/**
 * @concept CalendarEvent
 * @purpose Post and update team events (practices, meets, deadlines).
 * @principle When a coach posts or updates an event, all team athletes can view it.
 */
export default class CalanderEventConcept {
  private events: Collection<Event>;

  constructor(private readonly db: Db) {
    this.events = this.db.collection<Event>(PREFIX + "events");
  }

  /**
   * @requires event exists
   * @effects returns the event
   *
   * @param eventId the id of the event you want
   * @returns the event you queried
   */
  async getEvent(eventId: EventID): Promise<Event | { error: string }> {
    const event = await this.events.findOne({ _id: eventId });

    if (!event) return { error: `Event with ID '${eventId}' does not exist.` };
    return event;
  }

  /**
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
   */

  async createEvent(startTime: Date,
    endTime: Date,
    location: string,
    title: string,
    description?: string,
    link?: string,
  ): Promise<{ event: EventID } | { error: string }> {
    //verify timing constraint
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
   * deletes the event based on the event id
   *
   * @requires event exists
   * @effects deletes the event with the given id
   *
   * @param event The ID of the event to delete.
   *
   * @returns an empty object on success, or an error message.
   */
  async deleteEvent( event: EventID): Promise<Empty | { error: string }> {
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
   * Edits a part(s) of the event
   *
   * @requires all updates are an attribute of event
   * @requires if changing start or end time that they are still start < end
   * @effects edits the event
   * 
   * @param {Object} args - The arguments for editing an event.
   * @param {UserIdentifier} args.editor - The identifier of the user editing the event.
   * @param {EventID} args.event - The ID of the event to edit.
   * @param {Partial<Omit<EventDocument, "_id">>} args.updates - An object containing fields to update and their new values.
   *
   * @returns an empty object on success, or an error message.
   */
  async editEvent(event: EventID,updates: Partial<Omit<Event, "_id">>): Promise<Empty | { error: string }> {
    try {
      // make sure only the updateable fields are there
      const EDITABLE_FIELDS = new Set<keyof Omit<Event, "_id">>([
        "startTime",
        "endTime",
        "location",
        "title",
        "description",
        "link",
      ]);
      const badKeys = Object.keys(updates).filter(
        (k) => !EDITABLE_FIELDS.has(k as keyof Omit<Event, "_id">),
      );
      if (badKeys.length > 0) {
        return {
          error: `Unknown or disallowed fields in updates: ${
            badKeys.join(", ")
          }`,
        };
      }

      // Fetch existing event
      const existingEvent = await this.events.findOne({ _id: event });
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
      const $unset: Record<string, ""> = {};

      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined) continue; // omit → no change

        if (
          (k === "description" || k === "link") &&
          (v === "" || (v as any) === null)
        ) {
          $unset[k] = "";
          continue;
        }

        // For all other fields, set directly (types assumed correct at this layer)
        ($set as any)[k] = v;
      }

      // If nothing to change, short-circuit
      if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
        return {};
      }

      const updateDoc: Record<string, unknown> = {};
      if (Object.keys($set).length) updateDoc.$set = $set;
      if (Object.keys($unset).length) updateDoc.$unset = $unset;

      // 7) Apply the update
      const result = await this.events.updateOne({ _id: event }, updateDoc);

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

  /**
   * creates a new event, exactly the same as the requested event
   *
   * @requires the event you want to duplicate exists
   * @effects duplicated the event exactly as it is, and returns the id
   *          of the new event
   *
   * @param event - The ID of the event to duplicate.
   *
   * @returns the ID of the new, duplicated event on success, or an error message.
   */
  async duplicateEvent(event: EventID): Promise<{ duplicateEvent: EventID } | { error: string }> {
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
   */
  async getEventsByDate(
    day: number,
    month: number,
    year: number,
  ): Promise<{ events: Event[] } | { error: string }> {
    // Basic parameter validation
    if (
      !Number.isInteger(day) || !Number.isInteger(month) ||
      !Number.isInteger(year)
    ) {
      return { error: "day, month and year must be integers." };
    }

    // Construct the start and end of the requested day in local time
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    // Validate that the date components did not roll over (e.g., invalid day like Feb 30)
    if (
      startOfDay.getFullYear() !== year ||
      startOfDay.getMonth() !== month - 1 || startOfDay.getDate() !== day
    ) {
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
