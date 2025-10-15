## Concept

    concept Notifications:
        purpose: Deliver updates and reminders about events, logs, or team activity.
        principle: when key events occur, notifications are generated and queued; recipients are then sent a message at the scheduled time according to their repetition rules

        state:
            a set of Notifications with:
                recipients {Users}
                events {Event} //these are going to be in a list format in the email
                a messageEmail String //the message that is going to be sent
                a scheduledAt DateTime

        actions:
            create(sender: user_id, recipients: {User_id's}, events: Event_id[], additionalMessage: String, scheduledAt: DateTime)
                requires: 
                    - sender is a coach
                    - sender exists
                    - recipients exist 
                    - recipients are on the team
                    - scheduledAt ≥ now, event exists
                effects: creates new Notification with the recipients, scheduled at the schedule time, makes the events into a message in list format giving the date/time, location, description, and/or link and additionally appends the additional message at the bottom of the events lists. 
            
            addEvent(editor: user_id, event:Event_id, notification: Notification_id)
                requires: 
                    - editor exists
                    - editor is a coach
                    - event exists
                    - notification exists
                effects: adds event to the notification and edits the message to have the event

            send(sender: user_id, notification: Notification_id)
                requires: 
                    - sender exists
                    - sender is a coach
                    - notification exists
                effects: emails the message to the gmails of the recipients from the coaches email