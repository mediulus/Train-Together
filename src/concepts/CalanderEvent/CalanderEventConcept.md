## Concept

    concept CalendarEvent:
        purpose: Post and update team events (practices, meets, deadlines).
        principle: A user will create a calander event which they can later edit, duplicate or delete. Additionally, in a calander that will could be displayed all of the events will be selected per day.

        state:
            a set of Events with:
                and id ID
                a teamId ID
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
                
            createEvent(teamId: ID, startTime: DateTime, endTime: DateTime, location: String, title: String, description?: String, link?: URL) : (event: ID)
                requires: 
                    - startTime < endTime
                effects: generates a new Event with startTime = startTime, endTime = endTime, location = location, title = title and the optional parameters description = description and link = link

            deleteEvent(deleter: ID, event: ID)
                requires: event exists
                effects: deletes the event

            editEvent(editor: ID, event: ID, fields..., updateValues...)
                requires:
                    - all update values are valid keys
                    - if updating start or end, start < end
                effects: updates the event with the given fields and their new values

            getEventsByDate(day: number, month: number, year: number): Event[]
                requires: all dates are valid
                effects: returns all of the events that fall on that day