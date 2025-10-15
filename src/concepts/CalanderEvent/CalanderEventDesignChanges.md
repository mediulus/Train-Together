I made a few small changes to improve safety and frontend convenience:

- Added an ID field to each Event so lookups are stable and safe even if a title or other field changes.
- Changed parameters that previously accepted raw strings to use IDs where appropriate (based on feedback from Assignment 2) to reduce ambiguity and improve security.

I also added the `getEventsByDate` action to support the calendar UI: it returns all events that fall on a specific day (useful for daily agenda views).