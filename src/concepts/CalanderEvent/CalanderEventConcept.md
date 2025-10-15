## Concept

    concept CalendarEvent:
        purpose: Post and update team events (practices, meets, deadlines).
        principle: When a coach posts or updates an event, all team athletes can view it.

        state:
            a set of Events with:
                and id ID
                a startTime DateTime
                an endTime DateTime
                a location String
                a title String
                a description? String
                a link? URL

        actions:
            getEvent(event: ID): Event
                requires: event exists
                effects: returns the existing event
                
            createEvent(creator: ID, startTime: DateTime, endTime: DateTime, location: String, title: String, description?: String, link?: URL) : (event: ID)
                requires: 
                    - creator exists
                    - creator role = coach
                    - startTime < endTime
                effects: generates a new Event with startTime = startTime, endTime = endTime, location = location, title = title and the optional parameters description = description and link = link

            deleteEvent(deleter: ID, event: ID)
                requires: user exists with name = deleter and role = coach, and event exists
                effects: deletes the event

            editEvent(editor: ID, event: ID, fields..., updateValues...)
                requires: 
                    - user exists 
                    - role = coach
                    -  event exists
                    - if updating start or end, start < end
                effects: updates the event with the given fields and their new values

            duplicateEvent(duplicator: ID, event: ID): (duplicateEvent: Event)
                requires: 
                    - user exists 
                    - role = coach
                    - event exists
                effects: creates a new event with the same parameters as the inputted event

            getEventsByDate(day: number, month: number, year: number): Event[]
                requires: all dates are valid
                effects: returns all of the events that fall on that day