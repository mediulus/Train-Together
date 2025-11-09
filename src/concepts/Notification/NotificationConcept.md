## Concept

    concept Notifications:
        purpose: Deliver updates and reminders about events, logs, or team activity.
        principle: A sender creates a notification with certain events, then they add an event to the notification if they want, and then they send the notification!

        state:
            a set of Notifications with:
                id ID
                a sender User
                recipients {Users}
                events {Event} 
                a messageEmail String //the message that is going to be sent
                a createdAt

        actions:
            create(sender: user, recipients: {User}, events: Event[], additionalMessage: String)
                requires: scheduledAt ≥ now, event exists
                effects: creates new Notification with the recipients, scheduled at the schedule time, makes the events into a message in list format giving the date/time, location, description, and/or link and additionally appends the additional message at the bottom of the events lists. 

            send(notification: Notification_id)
                requires: notification exists
                effects: emails the message to the gmails of the recipients from the coaches email