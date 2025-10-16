# CalendarEvent — Design Change Summary

Narrowed and de-coupled to make events easy to create, query, and modify without embedding role checks. Added stable IDs and a day-based query for the calendar UI.

## Rationale
- Stable id enables safe lookups even if titles change.
- Remove role/user coupling to keep the concept modular; enforce authorization in syncs or callers.
- Add getEventsByDate for daily agenda views without frontend filtering boilerplate.

## State Changes
- Added: id: ID (canonical event identifier).
- Made optional: description?: String, link?: URL.

## Actions 
I changed all of the role requirements for the actions so that my concepts do not rely on each other. I also added the following action for the calander UI where each day is going to be displayed and I will want to get all of thoser actions for that day: getEventsByDate(day, month, year) → Event[]

## Design Notes
- Decoupled auth: No role/name checks in this concept; apply in UserDirectory/syncs.
- IDs over names: Prefer eventId for all mutations/reads to avoid ambiguity.
