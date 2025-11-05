import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertObjectMatch,
} from "@std/assert";
import { testDb } from "@utils/database.ts";
import CalanderEventConcept, { Event } from "./CalanderEventConcept.ts";
import { ID } from "@utils/types.ts";

Deno.test("CalendarEventConcept", async (t) => {
  const [db, client] = await testDb();
  const concept = new CalanderEventConcept(db);

  Deno.test.beforeAll(async () => {
    // Ensure collections are empty before tests begin (testDb handles drops before each file,
    // but useful if we were to restructure tests within this file not using Deno.test.beforeEach)
    await db.collection("CalnderEvent.events").deleteMany({});
  });

  // Helper function to create dates for testing, simplifying test cases
  const createDate = (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number = 0
  ) => new Date(year, month - 1, day, hour, minute);

  await t.step("1. createEvent confirms requires and effects", async (t) => {
    const teamId = "team-1" as ID;
    const startTime1 = createDate(2024, 7, 20, 9, 0);
    const endTime1 = createDate(2024, 7, 20, 10, 0);
    const location1 = "Main Gym";
    const title1 = "Morning Practice";
    const description1 = "Cardio and strength training.";
    const link1 = "http://example.com/practice";

    let createdEventId: ID;

    await t.step("requires: startTime < endTime", async () => {
      // Test case: startTime equals endTime
      const invalidResult1 = await concept.createEvent(
        teamId,
        createDate(2024, 8, 1, 10, 0),
        createDate(2024, 8, 1, 10, 0),
        "Location",
        "Title"
      );
      assertObjectMatch(invalidResult1, {
        error: "Event start time must be before end time.",
      });

      // Test case: startTime is after endTime
      const invalidResult2 = await concept.createEvent(
        teamId,
        createDate(2024, 8, 1, 11, 0),
        createDate(2024, 8, 1, 10, 0),
        "Location",
        "Title"
      );
      assertObjectMatch(invalidResult2, {
        error: "Event start time must be before end time.",
      });
    });

    await t.step("effects: generates a new Event", async () => {
      const result = await concept.createEvent(
        teamId,
        startTime1,
        endTime1,
        location1,
        title1,
        description1,
        link1
      );

      assertInstanceOf(result, Object);
      assertEquals("event" in result, true);
      createdEventId = (result as { event: ID }).event;
      assertExists(createdEventId);

      // Verify the event can be retrieved and matches the input
      const retrievedEvent = await concept.getEvent(createdEventId);
      assertInstanceOf(retrievedEvent, Object);
      assertEquals("error" in retrievedEvent, false);
      assertObjectMatch(retrievedEvent as Event, {
        _id: createdEventId,
        startTime: startTime1,
        endTime: endTime1,
        location: location1,
        title: title1,
        description: description1,
        link: link1,
      });
    });
  });

  await t.step("2. getEvent confirms requires and effects", async (t) => {
    const startTime = createDate(2024, 7, 21, 14, 0);
    const endTime = createDate(2024, 7, 21, 16, 0);
    const teamId = "team-2" as ID;
    const { event: eventId } = (await concept.createEvent(
      teamId,
      startTime,
      endTime,
      "Pool",
      "Swim Meet Prep"
    )) as { event: ID };

    await t.step("requires: event exists", async () => {
      const nonExistentId = "nonExistentId" as ID;
      const result = await concept.getEvent(nonExistentId);
      assertObjectMatch(result, {
        error: `Event with ID '${nonExistentId}' does not exist.`,
      });
    });

    await t.step("effects: returns the existing event", async () => {
      const result = await concept.getEvent(eventId);
      assertInstanceOf(result, Object);
      assertEquals("error" in result, false);
      assertObjectMatch(result as Event, {
        _id: eventId,
        startTime: startTime,
        endTime: endTime,
        location: "Pool",
        title: "Swim Meet Prep",
      });
    });
  });

  await t.step("3. editEvent confirms requires and effects", async (t) => {
    const startTime = createDate(2024, 7, 22, 8, 0);
    const endTime = createDate(2024, 7, 22, 9, 0);
    const teamId = "team-3" as ID;
    const { event: eventId } = (await concept.createEvent(
      teamId,
      startTime,
      endTime,
      "Track",
      "Morning Run",
      "Long distance run"
    )) as { event: ID };

    await t.step("requires: all update values are valid keys", async () => {
      const result = await concept.editEvent(eventId, {
        // @ts-ignore: testing invalid key
        invalidKey: "someValue",
      });
      assertObjectMatch(result, {
        error: "Unknown or disallowed fields in updates: invalidKey",
      });
    });

    await t.step(
      "requires: if updating start or end, start < end",
      async () => {
        // New start time after end time
        const invalidResult1 = await concept.editEvent(eventId, {
          startTime: createDate(2024, 7, 22, 10, 0),
        });
        assertObjectMatch(invalidResult1, {
          error: "Updated start time must be before end time.",
        });

        // New end time before start time
        const invalidResult2 = await concept.editEvent(eventId, {
          endTime: createDate(2024, 7, 22, 7, 0),
        });
        assertObjectMatch(invalidResult2, {
          error: "Updated start time must be before end time.",
        });

        // New start time equals new end time
        const invalidResult3 = await concept.editEvent(eventId, {
          startTime: createDate(2024, 7, 22, 8, 30),
          endTime: createDate(2024, 7, 22, 8, 30),
        });
        assertObjectMatch(invalidResult3, {
          error: "Updated start time must be before end time.",
        });
      }
    );

    await t.step("requires: event exists", async () => {
      const result = await concept.editEvent("nonExistentId" as ID, {
        title: "New Title",
      });
      assertObjectMatch(result, {
        error: "Event with ID 'nonExistentId' not found.",
      });
    });

    await t.step(
      "effects: updates the event with the given fields and their new values",
      async () => {
        const newStartTime = createDate(2024, 7, 22, 8, 30);
        const newEndTime = createDate(2024, 7, 22, 9, 30);
        const newLocation = "Park";
        const newTitle = "Morning Stretch";
        const newLink = "http://newlink.com";

        const editResult = await concept.editEvent(eventId, {
          startTime: newStartTime,
          endTime: newEndTime,
          location: newLocation,
          title: newTitle,
          description: "", // ← use "" (or null) to CLEAR the field
          link: newLink,
        });
        assertEquals(editResult, {}); // Empty object for success

        const updatedEvent = await concept.getEvent(eventId);
        assertInstanceOf(updatedEvent, Object);
        assertEquals("error" in updatedEvent, false);
        assertObjectMatch(updatedEvent as Event, {
          _id: eventId,
          startTime: newStartTime,
          endTime: newEndTime,
          location: newLocation,
          title: newTitle,
          link: newLink,
        });
        // After $unset, the field won't exist, so reading it is `undefined`
        assertEquals((updatedEvent as Event).description, undefined);
      }
    );
  });

  await t.step("4. duplicateEvent confirms requires and effects", async (t) => {
    const startTime = createDate(2024, 7, 23, 17, 0);
    const endTime = createDate(2024, 7, 23, 18, 0);
    const teamId = "team-4" as ID;
    const { event: originalEventId } = (await concept.createEvent(
      teamId,
      startTime,
      endTime,
      "Gym",
      "Weight Training",
      "Full body workout"
    )) as { event: ID };

    await t.step("requires: event exists", async () => {
      const result = await concept.duplicateEvent("nonExistentId" as ID);
      assertObjectMatch(result, {
        error: "Event with ID 'nonExistentId' not found.",
      });
    });

    await t.step(
      "effects: creates a new event with the same parameters",
      async () => {
        const result = await concept.duplicateEvent(originalEventId);
        assertInstanceOf(result, Object);
        assertEquals("duplicateEvent" in result, true);
        const duplicateEventId = (result as { duplicateEvent: ID })
          .duplicateEvent;
        assertExists(duplicateEventId);
        assertEquals(originalEventId === duplicateEventId, false); // IDs must be different

        const originalEvent = (await concept.getEvent(
          originalEventId
        )) as Event;
        const duplicatedEvent = (await concept.getEvent(
          duplicateEventId
        )) as Event;

        assertObjectMatch(duplicatedEvent, {
          startTime: originalEvent.startTime,
          endTime: originalEvent.endTime,
          location: originalEvent.location,
          title: originalEvent.title,
          description: originalEvent.description,
        });
        // Ensure description and link are copied even if undefined in original
        assertEquals(duplicatedEvent.description, originalEvent.description);
        assertEquals(duplicatedEvent.link, originalEvent.link);
      }
    );
  });

  await t.step(
    "5. getEventsByDate confirms requires and effects",
    async (t) => {
      // Create several events for different dates and overlaps
      const teamA = "team-A" as ID;
      const teamB = "team-B" as ID;
      const event1_id = (
        (await concept.createEvent(
          teamA,
          createDate(2024, 8, 15, 9, 0),
          createDate(2024, 8, 15, 10, 0),
          "Venue A",
          "Daily Briefing"
        )) as { event: ID }
      ).event;
      const event2_id = (
        (await concept.createEvent(
          teamA,
          createDate(2024, 8, 15, 11, 0),
          createDate(2024, 8, 15, 12, 0),
          "Venue B",
          "Team Meeting"
        )) as { event: ID }
      ).event;
      const event3_id = (
        (await concept.createEvent(
          teamA,
          createDate(2024, 8, 14, 16, 0),
          createDate(2024, 8, 16, 10, 0), // Spans Aug 14, 15, 16
          "Venue C",
          "Multi-day Workshop"
        )) as { event: ID }
      ).event;
      const event4_id = (
        (await concept.createEvent(
          teamA,
          createDate(2024, 8, 16, 9, 0),
          createDate(2024, 8, 16, 10, 0),
          "Venue A",
          "Cleanup Drive"
        )) as { event: ID }
      ).event;
      const event5_id = (
        (await concept.createEvent(
          teamA,
          createDate(2024, 8, 15, 9, 30),
          createDate(2024, 8, 15, 9, 45), // Overlaps with Event 1
          "Venue A",
          "Quick Chat"
        )) as { event: ID }
      ).event;

      await t.step("requires: all dates are valid", async () => {
        // Invalid month
        const invalidResult1 = await concept.getEventsByDate(
          1,
          13,
          2024,
          teamA
        );
        assertObjectMatch(invalidResult1, { error: "Invalid date: 2024-13-1" });

        // Invalid day for month (Feb 30)
        const invalidResult2 = await concept.getEventsByDate(
          30,
          2,
          2024,
          teamA
        );
        assertObjectMatch(invalidResult2, { error: "Invalid date: 2024-2-30" });

        // Non-integer inputs
        // @ts-ignore: testing invalid input type
        const invalidResult3 = await concept.getEventsByDate(
          1.5,
          7,
          2024,
          teamA
        );
        assertObjectMatch(invalidResult3, {
          error: "day, month and year must be integers.",
        });
      });

      await t.step(
        "effects: returns all of the events that fall on that day",
        async () => {
          // Test for August 15, 2024
          const result15 = await concept.getEventsByDate(15, 8, 2024, teamA);
          assertInstanceOf(result15, Object);
          assertEquals("error" in result15, false);
          const events15 = (result15 as { events: Event[] }).events
            .map((e) => e._id)
            .sort();
          assertEquals(
            events15,
            [event1_id, event2_id, event3_id, event5_id].sort()
          ); // All events on the 15th, plus the multi-day event

          // Test for August 14, 2024
          const result14 = await concept.getEventsByDate(14, 8, 2024, teamA);
          const events14 = (result14 as { events: Event[] }).events
            .map((e) => e._id)
            .sort();
          assertEquals(events14, [event3_id].sort());

          // Test for August 16, 2024
          const result16 = await concept.getEventsByDate(16, 8, 2024, teamA);
          const events16 = (result16 as { events: Event[] }).events
            .map((e) => e._id)
            .sort();
          assertEquals(events16, [event3_id, event4_id].sort());

          // Test for a day with no events
          const resultNoEvents = await concept.getEventsByDate(
            1,
            1,
            2024,
            teamA
          );
          const eventsNoEvents = (resultNoEvents as { events: Event[] }).events;
          assertEquals(eventsNoEvents.length, 0);

          // Ensure team scoping: events created for teamB do not appear for teamA
          const teamBEventId = (
            (await concept.createEvent(
              teamB,
              createDate(2024, 8, 15, 8, 0),
              createDate(2024, 8, 15, 9, 0),
              "Venue X",
              "TeamB Only"
            )) as { event: ID }
          ).event;
          const teamAView = await concept.getEventsByDate(15, 8, 2024, teamA);
          const idsA = (teamAView as { events: Event[] }).events.map(
            (e) => e._id
          );
          // teamBEventId should not be present in teamA query
          assertEquals(idsA.includes(teamBEventId), false);
        }
      );
    }
  );

  await t.step("6. deleteEvent confirms requires and effects", async (t) => {
    const startTime = createDate(2024, 7, 24, 10, 0);
    const endTime = createDate(2024, 7, 24, 11, 0);
    const teamId = "team-del" as ID;
    const { event: eventId } = (await concept.createEvent(
      teamId,
      startTime,
      endTime,
      "Conference Room",
      "Project Review"
    )) as { event: ID };

    await t.step("requires: event exists", async () => {
      const result = await concept.deleteEvent("nonExistentId" as ID);
      assertObjectMatch(result, {
        error: "Event with ID 'nonExistentId' not found.",
      });
    });

    await t.step("effects: deletes the event", async () => {
      const deleteResult = await concept.deleteEvent(eventId);
      assertEquals(deleteResult, {}); // Empty object for success

      // Verify the event is indeed deleted
      const retrievedEvent = await concept.getEvent(eventId);
      assertObjectMatch(retrievedEvent, {
        error: `Event with ID '${eventId}' does not exist.`,
      });
    });
  });

  // trace:
  await t.step("Trace: fulfilling the principle", async (_t) => {
    const _userId = "user123" as ID; // Placeholder not used

    // 1. A user will create a calendar event
    const initialStartTime = createDate(2025, 1, 10, 9, 0);
    const initialEndTime = createDate(2025, 1, 10, 10, 0);
    const initialLocation = "School Auditorium";
    const initialTitle = "First Day of Practice";
    const initialDescription = "Meet the coach and team.";
    const teamId = "team-trace" as ID;
    const { event: eventId } = (await concept.createEvent(
      teamId,
      initialStartTime,
      initialEndTime,
      initialLocation,
      initialTitle,
      initialDescription
    )) as { event: ID };
    assertExists(eventId);
    console.log(`TRACE: Created event '${initialTitle}' with ID: ${eventId}`);

    // Verify it exists and can be retrieved
    const createdEvent = (await concept.getEvent(eventId)) as Event;
    assertObjectMatch(createdEvent, { _id: eventId, title: initialTitle });

    // 2. all of the events will be selected per day (initial verification)
    const day = 10;
    const month = 1;
    const year = 2025;
    let eventsOnDay = (await concept.getEventsByDate(
      day,
      month,
      year,
      teamId
    )) as { events: Event[] };
    assertEquals(eventsOnDay.events.length, 1);
    assertEquals(eventsOnDay.events[0]._id, eventId);
    console.log(
      `TRACE: Verified event appears on ${year}-${month}-${day}. Events found: ${eventsOnDay.events.length}`
    );

    // 3. which they can later edit
    const newTitle = "Team Welcome Session";
    const newDescription = "Introductions and season overview.";
    const newStartTime = createDate(2025, 1, 10, 9, 30);
    const newEndTime = createDate(2025, 1, 10, 11, 0);
    await concept.editEvent(eventId, {
      title: newTitle,
      description: newDescription,
      startTime: newStartTime,
      endTime: newEndTime,
    });
    console.log(
      `TRACE: Edited event '${eventId}' to title: '${newTitle}' and new times.`
    );

    // Verify changes
    const editedEvent = (await concept.getEvent(eventId)) as Event;
    assertObjectMatch(editedEvent, {
      _id: eventId,
      title: newTitle,
      description: newDescription,
      startTime: newStartTime,
      endTime: newEndTime,
    });
    console.log(`TRACE: Confirmed event '${eventId}' has new title and times.`);

    // Verify it still appears on the same day (times changed but still within Jan 10)
    eventsOnDay = (await concept.getEventsByDate(day, month, year, teamId)) as {
      events: Event[];
    };
    assertEquals(eventsOnDay.events.length, 1);
    assertEquals(eventsOnDay.events[0]._id, eventId);
    assertEquals(eventsOnDay.events[0].title, newTitle);
    console.log(
      `TRACE: Verified edited event still appears on ${year}-${month}-${day}. Events found: ${eventsOnDay.events.length}`
    );

    // 4. duplicate it
    const { duplicateEvent: duplicatedEventId } = (await concept.duplicateEvent(
      eventId
    )) as {
      duplicateEvent: ID;
    };
    assertExists(duplicatedEventId);
    assertEquals(eventId !== duplicatedEventId, true);
    console.log(
      `TRACE: Duplicated event '${eventId}' to new event ID: ${duplicatedEventId}`
    );

    // Verify both original and duplicated events exist and are identical (except ID)
    const originalAfterDuplication = (await concept.getEvent(eventId)) as Event;
    const duplicatedEvent = (await concept.getEvent(
      duplicatedEventId
    )) as Event;
    assertObjectMatch(originalAfterDuplication, {
      title: newTitle,
      description: newDescription,
    });
    assertObjectMatch(duplicatedEvent, {
      title: newTitle,
      description: newDescription,
    });
    assertEquals(
      originalAfterDuplication.startTime.getTime(),
      duplicatedEvent.startTime.getTime()
    );
    console.log(
      `TRACE: Confirmed original and duplicated events are present and content matches.`
    );

    // Verify both appear when getting events by date
    eventsOnDay = (await concept.getEventsByDate(day, month, year, teamId)) as {
      events: Event[];
    };
    assertEquals(eventsOnDay.events.length, 2);
    const foundIds = eventsOnDay.events.map((e) => e._id).sort();
    assertEquals(foundIds, [eventId, duplicatedEventId].sort());
    console.log(
      `TRACE: Confirmed both original and duplicated events appear on ${year}-${month}-${day}.`
    );

    // 5. or delete it (the original one)
    await concept.deleteEvent(eventId);
    console.log(`TRACE: Deleted original event '${eventId}'.`);

    // Verify original event is gone
    const deletedEventCheck = await concept.getEvent(eventId);
    assertObjectMatch(deletedEventCheck, {
      error: `Event with ID '${eventId}' does not exist.`,
    });
    console.log(`TRACE: Confirmed event '${eventId}' is deleted.`);

    // Verify only the duplicated event remains on the day
    eventsOnDay = (await concept.getEventsByDate(day, month, year, teamId)) as {
      events: Event[];
    };
    assertEquals(eventsOnDay.events.length, 1);
    assertEquals(eventsOnDay.events[0]._id, duplicatedEventId);
    console.log(
      `TRACE: Confirmed only the duplicated event '${duplicatedEventId}' remains on ${year}-${month}-${day}.`
    );

    console.log("TRACE: Principle fully demonstrated.");
  });

  await client.close();
});
