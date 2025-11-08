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
  teamId: ID; // team scope
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
  async getEvent(
    input: EventID | { eventId?: EventID; event?: EventID }
  ): Promise<Event | { error: string }> {
    const eventId =
      typeof input === "string" ? input : input.eventId ?? input.event;
    if (!eventId) return { error: "Missing eventId." };
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

  async createEvent(
    input:
      | ID
      | {
          teamId?: ID;
          startTime?: string | Date;
          endTime?: string | Date;
          location?: string;
          title?: string;
          description?: string;
          link?: string;
        },
    maybeStart?: Date | string,
    maybeEnd?: Date | string,
    maybeLocation?: string,
    maybeTitle?: string,
    maybeDescription?: string,
    maybeLink?: string
  ): Promise<{ event: EventID } | { error: string }> {
    // Support createEvent({ teamId, startTime, endTime, ... }) OR positional createEvent(teamId, start, end, location, title, desc?, link?)
    let teamId: ID | undefined;
    let startTimeRaw: Date | string | undefined = maybeStart;
    let endTimeRaw: Date | string | undefined = maybeEnd;
    let location: string | undefined = maybeLocation;
    let title: string | undefined = maybeTitle;
    let description: string | undefined = maybeDescription;
    let link: string | undefined = maybeLink;

    if (typeof input === "object" && input !== null) {
      teamId = input.teamId;
      startTimeRaw = input.startTime;
      endTimeRaw = input.endTime;
      location = input.location;
      title = input.title;
      description = input.description;
      link = input.link;
    } else {
      teamId = input as ID;
    }

    if (!teamId) return { error: "Missing teamId." };
    if (!startTimeRaw) return { error: "Missing startTime." };
    if (!endTimeRaw) return { error: "Missing endTime." };
    if (!location) return { error: "Missing location." };
    if (!title) return { error: "Missing title." };

    const toDate = (v: Date | string | undefined): Date | null => {
      if (!v) return null;
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    const startTime = toDate(startTimeRaw);
    const endTime = toDate(endTimeRaw);
    if (!startTime) return { error: "Invalid startTime." };
    if (!endTime) return { error: "Invalid endTime." };
    if (startTime.getTime() >= endTime.getTime()) {
      return { error: "Event start time must be before end time." };
    }

    const newEvent: Event = {
      _id: freshID(),
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
  async deleteEvent(
    input: EventID | { eventId?: EventID; event?: EventID }
  ): Promise<Empty | { error: string }> {
    // Requires: event exists
    try {
      const eventId =
        typeof input === "string" ? input : input.eventId ?? input.event;
      if (!eventId) return { error: "Missing eventId." };
      const result = await this.events.deleteOne({ _id: eventId });

      if (result.deletedCount === 0) {
        return { error: `Event with ID '${eventId}' not found.` };
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
  async editEvent(
    input:
      | EventID
      | {
          eventId?: EventID;
          event?: EventID;
          updates?: Partial<Omit<Event, "_id">> | null;
        },
    maybeUpdates?: Partial<Omit<Event, "_id">>
  ): Promise<Empty | { error: string }> {
    try {
      // Normalize args: support editEvent(eventId, updates) and editEvent({ eventId|event, updates })
      const eventId: EventID | undefined =
        typeof input === "string"
          ? (input as EventID)
          : input?.eventId ?? input?.event;
      const updatesRaw =
        typeof input === "string"
          ? maybeUpdates
          : (input?.updates as Partial<Omit<Event, "_id">> | null | undefined);

      if (!eventId) return { error: "Missing eventId." };
      if (!updatesRaw || typeof updatesRaw !== "object") {
        return { error: "No updates provided." };
      }

      const updates: Partial<Omit<Event, "_id">> = { ...updatesRaw };

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
        (k) => !EDITABLE_FIELDS.has(k as keyof Omit<Event, "_id">)
      );
      if (badKeys.length > 0) {
        return {
          error: `Unknown or disallowed fields in updates: ${badKeys.join(
            ", "
          )}`,
        };
      }

      // Fetch existing event
      const existingEvent = await this.events.findOne({ _id: eventId });
      if (!existingEvent) {
        return { error: `Event with ID '${eventId}' not found.` };
      }

      // Basic runtime type checks for Dates on provided fields
      const isValidDate = (d: unknown): d is Date =>
        d instanceof Date && !isNaN(d.getTime());
      // Coerce string times to Date objects if provided as ISO strings
      const coerceDateField = (key: "startTime" | "endTime") => {
        const val = updates[key];
        if (typeof val === "string") {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            updates[key] = d as Date;
          }
        }
      };
      coerceDateField("startTime");
      coerceDateField("endTime");

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

      for (const [k, v] of Object.entries(updates) as Array<
        [keyof Omit<Event, "_id">, unknown]
      >) {
        if (v === undefined) continue; // omit → no change

        if ((k === "description" || k === "link") && (v === "" || v === null)) {
          $unset[k] = "";
          continue;
        }

        // For all other fields, set directly (types assumed correct at this layer)
        // Narrow assignment using keyof and type guard
        ($set as Record<string, unknown>)[k as string] = v as never;
      }

      // If nothing to change, short-circuit
      if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
        return {};
      }

      const updateDoc: Record<string, unknown> = {};
      if (Object.keys($set).length) updateDoc.$set = $set;
      if (Object.keys($unset).length) updateDoc.$unset = $unset;

      // 7) Apply the update
      const result = await this.events.updateOne({ _id: eventId }, updateDoc);

      if (result.matchedCount === 0) {
        // Extremely unlikely given the earlier read, but guard anyway.
        return {
          error: `Event with ID '${eventId}' not found (update failed).`,
        };
      }

      return {};
    } catch (e) {
      console.error("Error editing event:", e);
      return { error: "Failed to edit event due to a database error." };
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
  async getEventsByDate({
    day,
    month,
    year,
    teamId,
  }: {
    day: number;
    month: number;
    year: number;
    teamId: ID;
  }): Promise<{ events: Event[] } | { error: string }> {
    // Basic parameter validation
    if (
      !Number.isInteger(day) ||
      !Number.isInteger(month) ||
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
  }
}
