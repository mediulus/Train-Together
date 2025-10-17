megandiulus@Megans-MacBook-Pro Train-Together % deno test -A src/concepts/Notification/NotificationConcept.test.ts
Check file:///Users/megandiulus/Desktop/6.104/Assignment 4/Train-Together/src/concepts/Notification/NotificationConcept.test.ts
running 1 test from ./src/concepts/Notification/NotificationConcept.test.ts
Notification: user creates a notification with events, adds an event, then sends it ...
  1. User creates a notification with some events ... ok (97ms)
  1.1. (Negative) Create notification with scheduledAt in the past ... ok (1ms)
  2. User adds an event to a notification ... ok (179ms)
  2.1. (Negative) Non-sender tries to add an event ... ok (160ms)
  2.2. (Negative) Add event to non-existent notification ... ok (54ms)
  3. User sends the notification ... ok (82ms)
  3.1. (Negative) Send non-existent notification ... ok (35ms)
  3.2. (Negative) Send notification with sender lacking email ... ok (88ms)
  3.3. (Negative) Send notification with no valid recipient emails ... ok (80ms)
Notification: user creates a notification with events, adds an event, then sends it ... ok (1s)

ok | 1 passed (9 steps) | 0 failed (1s)