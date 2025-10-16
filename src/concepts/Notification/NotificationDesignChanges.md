# Notifications — Design Change Summary

Refactored to narrow scope and make responsibilities explicit without changing the core idea. Instead of supporting repetition rules, complex scheduling, or multiple channels, this version focuses on a single, well-scoped use case: a coach composes a short digest of one or more events, schedules it (or sends immediately), and the system delivers that digest by email to listed recipients. The concept clarifies state (what a Notification stores), the minimal action contract (create, addEvent, send), and documents key operational constraints (e.g., email addresses required; Gmail/OAuth needed to send on behalf of a coach). This yields a simpler implementation and a smaller, more testable surface, while preserving the intended UX. Future features (retries, recurring schedules, push notifications, richer templates) can layer on top without breaking primary flows.

## State Changes
- sender -- added this so that the person wanting to send it later can be verified that they are the official sender
- Events: {Event} — rendered as an email list (date/time, location, description/link).
- Removed: repetition and status

## Actions
Generally the actions remain unchanged, however the send action has added the parameter "sender" so that it can verify who is sending. Additionally the actions reflect the changes in state as to not be overly complicated. 
