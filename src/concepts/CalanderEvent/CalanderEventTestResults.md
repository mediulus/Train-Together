megandiulus@Megans-MacBook-Pro Train-Together % deno test -A src/concepts/CalanderEvent/CalanderEventConcept.test.ts
Check file:///Users/megandiulus/Desktop/6.104/Assignment 4/Train-Together/src/concepts/CalanderEvent/CalanderEventConcept.test.ts
running 1 test from ./src/concepts/CalanderEvent/CalanderEventConcept.test.ts
CalendarEventConcept ...
  1. createEvent confirms requires and effects ...
    requires: startTime < endTime ... ok (0ms)
    effects: generates a new Event ... ok (115ms)
  1. createEvent confirms requires and effects ... ok (116ms)
  2. getEvent confirms requires and effects ...
    requires: event exists ... ok (32ms)
    effects: returns the existing event ... ok (50ms)
  2. getEvent confirms requires and effects ... ok (123ms)
  3. editEvent confirms requires and effects ...
    requires: all update values are valid keys ... ok (1ms)
    requires: if updating start or end, start < end ... ok (112ms)
    requires: event exists ... ok (45ms)
    effects: updates the event with the given fields and their new values ... ok (125ms)
  3. editEvent confirms requires and effects ... ok (323ms)
  4. duplicateEvent confirms requires and effects ...
    requires: event exists ... ok (55ms)
    effects: creates a new event with the same parameters ... ok (177ms)
  4. duplicateEvent confirms requires and effects ... ok (277ms)
  5. getEventsByDate confirms requires and effects ...
    requires: all dates are valid ... ok (0ms)
    effects: returns all of the events that fall on that day ... ok (165ms)
  5. getEventsByDate confirms requires and effects ... ok (396ms)
  6. deleteEvent confirms requires and effects ...
    requires: event exists ... ok (39ms)
    effects: deletes the event ... ok (71ms)
  6. deleteEvent confirms requires and effects ... ok (150ms)
  Trace: fulfilling the principle ...
------- output -------
TRACE: Created event 'First Day of Practice' with ID: 0199ee23-e098-7547-aaaf-0315e3d26e71
TRACE: Verified event appears on 2025-1-10. Events found: 1
TRACE: Edited event '0199ee23-e098-7547-aaaf-0315e3d26e71' to title: 'Team Welcome Session' and new times.
TRACE: Confirmed event '0199ee23-e098-7547-aaaf-0315e3d26e71' has new title and times.
TRACE: Verified edited event still appears on 2025-1-10. Events found: 1
TRACE: Duplicated event '0199ee23-e098-7547-aaaf-0315e3d26e71' to new event ID: 0199ee23-e20a-7f84-8c2e-03a72d566eae
TRACE: Confirmed original and duplicated events are present and content matches.
TRACE: Confirmed both original and duplicated events appear on 2025-1-10.
TRACE: Deleted original event '0199ee23-e098-7547-aaaf-0315e3d26e71'.
TRACE: Confirmed event '0199ee23-e098-7547-aaaf-0315e3d26e71' is deleted.
TRACE: Confirmed only the duplicated event '0199ee23-e20a-7f84-8c2e-03a72d566eae' remains on 2025-1-10.
TRACE: Principle fully demonstrated.
----- output end -----
  Trace: fulfilling the principle ... ok (651ms)
CalendarEventConcept ... ok (3s)

ok | 1 passed (21 steps) | 0 failed (3s)

megandiulus@Megans-MacBook-Pro Train-Together % 