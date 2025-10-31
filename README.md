# 6.104 Assignment 4: Implementing Concepts

[Design Updates](./DesignUpdates.md)

All of my concepts have been broken down into files that contain 4 items:
1. The concept implementation
2. The concept spec markdown file 
3. The concept design changes from assignment 2
4. The concept test file
5. The concept passing test results

I have the following concepts:

1. [User Directory](/src/concepts/UserDirectory)
2. [Team Membership](/src/concepts/TeamMembership)
3. [Calander Events](/src/concepts/CalanderEvent)
4. [Notifications](/src/concepts/Notification)
5. [Training Records](/src/concepts/TrainingRecords)

## Interesting Moments

I found there to be many interesting moments throughout this lab, finding myself often having to think thoroughly through how the implementation would work on the front end so that my concepts were actually relevant, then later having to also make my concepts more generic as to not get to specific and begin to overlap with eachother. 


A detailed description of many of my interesting moments can be found in the "Design Changes" document for each concept, but I want to highlight a few here:

1. To begin with the UserDirectory concept: I knew I wanted users to log in using Google authentication, so I needed to implement Google authentication logins. This initially felt daunting, but I had previously taken Web.lab last IAP, where we used GoogleAuth in a similar way. I was able to follow that experience and use GitHub Copilot to help define the authorization for this application. More details are available [here](/src/concepts/UserDirectory/UserDirectoryDesignChanges.md), and the relevant function can be found [on line 94](/src/concepts/UserDirectory/UserDirectoryConcept.ts). [Context Help](context/design/concepts/UserDirectory/testing.md/steps/response.35ee6674.md)

2. For the TeamMembership concept, as I was writing the actions, I considered how they would benefit the front end. Specifically, I realized that all athletes for a given coach would need to be displayed in the weekly summary and would be required for syncing with TrainingRecords. To support this, I added the actions: getTeamByCoach, getTeamByAthlete, and getAthletesByTeam. More information is available [here](/src/concepts/TeamMembership/TeamMembershipDesign.md), and the functions can be found [here](/src/concepts/TeamMembership/TeamMembershipConcept.ts). [Original](context/design/concepts/CalanderEvent/implementation.md/steps/implement.710263f1.md)

3. Regarding the Notification concept, my original specification in Assignment 2 felt unfocused and somewhat disorganized. I believe this was partly due to relying too much on AI assistance, which prevented me from fully reflecting on what the concept was supposed to do and how it would be implemented. To address this, I narrowed in on my goal for notifications and redesigned the state. Fortunately, the actions I had already defined worked well and did not need to be changed. More information can be found [here](/src/concepts/Notification). [Original](context/design/concepts/Notifications/implementation.md/steps/implement.ce3266f9.md)

4. After meeting with my TA Erin, I realized my concepts were not very modular and relied heavily on each other, especially regarding role and team checking. These changes are evident throughout my design choices, but are particularly relevant in the CalanderEvent concept. Many of my requirements involved some sort of role requirement, which depended on the UserDirectory concept. I removed this dependency to make my concepts more generalizable and generic. Ultimately, I plan to implement these requirements into the syncs later on. More information can be found [here](/src/concepts/CalanderEvent). [Non-modular](context/design/concepts/CalanderEvent/implementation.md/steps/implement.710263f1.md)

5. My TrainingRecords concept underwent the most change during implementation. Initially, I tried to get information from Google Sheets, but this proved extremely difficult due to complex authorization and parsing requirements. I learned a lot in the process, especially about which Google APIs to enable. For example, to grab a Google Sheet by name, you need the Google Drive API enabled, but for reading or writing to a sheet, you need the Google Sheets API enabled. My original idea was to scrape a Google Sheet to avoid complexity in the UI for athlete data logging, but I had to choose between complicating the backend with Google Sheet authorizations or putting more effort into building an athlete logging page for the front end. I decided it would be more productive to build a more complex AI than to complicate the backend, since creating another UI aspect is feasible, but I was unsure if I could complete the actions using the Google Sheets API. [Original](context/design/concepts/TrainingRecords/implementation.md/steps/prompt.c3fb45e7.md)

6. Additionally, for my TrainingRecords concept, I decided not to use my AI recommendations, as this would add another layer of complexity. I wanted my project to remain feasible rather than become overly complicated. I made this decision so I could spend more time on my core features, rather than on a flashy feature that would detract from my other concepts or features. More information about points 5 and 6 can be found [here](/src/concepts/TrainingRecords/TrainingRecordsDesignChanges.md). [AI](context/design/concepts/TrainingRecords/implementation.md/steps/response.c5f88efe.md)

7. When I was debugging the TrainingRecords concept I was running into an issue where some of my sunday dates were not being read as sunday. The issue however was not in my code, but rather in my in my test case that context wrote where it used UTC. The issue is because my concept was using local time which causes certain weeks to be logged differently. [here](context/design/concepts/TrainingRecords/operationalprinciple.md/steps/response.286d0b43.md)

        function getDate(year: number, month: number, day: number): Date {
          // Use UTC to avoid local timezone issues for comparison with `atMidnight` logic
          return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        }