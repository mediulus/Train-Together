## Concept

    concept Notifications:
        purpose: Deliver updates and reminders about events, logs, or team activity.
        principle: when key events occur, notifications are generated and queued; recipients are then sent a message at the scheduled time according to their repetition rules

        state:
            a set of Notifications with:
                recipients {Users}
                importantEvents {Event}
                a message String
                a scheduledAt DateTime
                a repetition Enum{Weekly, Monthly, Daily, NonRepeating}
                a status Enum{queued, sent}

        actions:
            create(recipients: {User}, event?: Event, message: String, scheduledAt: DateTime, repetition: Enum)
                requires: recipients exist and scheduledAt ≥ now
                effects: creates new Notification with status = queued
            
            addEvent(event:Event, notification: Notification)
                requires: event exists,  notification exists
                effects: adds event to the notification and edits the message to have the event

            send(notification: Notification)
                requires: the notification’s status = queued and the current time is on or after the notification’s scheduled time
                effects: sets the notification’s status to sent. If the repetition is not NonRepeating, creates a new notification scheduled at the next time according to the repetition rule, with status queued

## Changes from Assignment 2
1. Added an id attribute for easy access 
2. Added the action "addRecipient" in case there need to be certain people to recieve a given notification