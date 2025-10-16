In earlier iterations, TrainingRecords tried to combine several different responsibilities: coach planning, athlete logging, weekly summaries, and AI feedback. This resulted in an overly complex concept that blended two distinct ideas — a coach–athlete interaction system and an athlete monitoring dashboard — into one.

To bring the design back within scope and align with the project timeline, I decided to refocus TrainingRecords exclusively on the athlete data and AI summarization side. Rather than modeling the coach’s inputs directly in the same concept, the system now assumes that all daily athlete data already exists in a canonical external source (a Google Sheet import). From that source, the concept computes week-over-week summaries and uses AI to generate short, factual recommendations describing how an athlete is responding to training.

This simplification preserves the AI component—which was the most distinctive and valuable part of the original vision—while eliminating the redundant complexity of coach-side CRUD actions and permission logic. The result is a cleaner, more purpose-driven concept that focuses on:

Accurate and traceable data import (from Google Sheets),

Automated weekly summaries and comparisons, and

Responsible AI-generated commentary that never modifies data.

Overall, this change makes the concept more cohesive, testable, and directly aligned with the operational principle: that automation should interpret existing summaries, not alter them.


UPDATE:
A challenge I have been running into is complexing surrounding authorization around extracting google sheet information. I was hesitant to make a "logData" section as that would add another aspect to my front end and complicate it more. However, I do not see this google sheets aspect being feasible within the scope of the project, so have therefore pivoted because I think the front end complexity is more valuabe than a infeasible back end.