---
timestamp: 'Sat Oct 11 2025 20:33:22 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_203322.09624a34.md]]'
content_id: 710263f14608060e4f57d1384b4c40fc07d01bc17d07dbf245f26183172bad39
---

# implement: CalanderEvent

```
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
```
