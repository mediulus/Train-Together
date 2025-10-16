# TrainingRecords — Design Change Summary

Originally I was trying to refocuse the athlete-data + AI summarization side, dropping coach-planning CRUD and permission logic from the concept itself. Daily data is canonical inside the app (pivoted away from Google Sheets auth to keep scope feasible), and the concept computes week-over-week summaries. However, later I got rid of the AI summaries for simplicity purposes. 

## Rationale
- Earlier versions mixed two ideas (coach planning + athlete monitoring); this returns to a single purpose.
- Google Sheets authorization added too much backend complexity; front-end logging is simpler and testable.
- Clear separation makes summaries auditable and AI outputs non-destructive.

## State Changes
**Removed:** `DailyRecord`, `CoachFields`, coach-authored plan fields.

**Added:**

  * AthleteData

    * `athleteId: ID`
    * `day: Date`
    * `mileage: number`
    * `stress: number`
    * `sleep: number`
    * `restingHeartRate: number`
    * `exerciseHeartRate: number`
    * `perceivedExertion: number`
    * `notes: string`

  * **Comparisons**

    * `activityMetric: number`
    * `trendDirection: "up" | "down" | "flat"`

  * **WeeklySummary**
    * `athleteId: ID`
    * `weekStart: Date` (canonical week start, e.g., Sunday)
    * `mileageSoFar: number`
    * `averageStress: Comparison`
    * `averageSleep: Comparison`
    * `averageRestingHeartRate: Comparison`
    * `averageExerciseHeartRate: Comparison`
    * `averagePerceivedExertion: Comparison`
    * `athleteDataDailyCollection: { AthleteData }`

> Note: prefer `ID`s (`athleteId`) over embedding whole `User` objects to keep boundaries clean.

## Actions (Updated)

* **createWeeklySummary(athleteId: ID, today: Date) → WeeklySummary**
  *Requires:* athlete exists; (optionally enforced by syncs: requester is a coach on same team).
  *Effects:* finds the current week (Sun–Sat), gathers this week + prior week data, computes averages and week-over-week comparisons, returns a `WeeklySummary`. AI reads this summary to produce commentary (stored separately).

* **logData(athleteId: ID, day: Date, fields...) → AthleteData**
  *Requires:* valid field keys; athlete exists.
  *Effects:* upsert the athlete’s daily record for `day`.

### What Changed vs. Old Version

* Dropped coach plan CRUD (`createRecord`, `updateCoachFields`, `deleteRecord`).
* Replaced free-form `athleteData JSONField` with typed `AthleteData`.
* Moved trend logic into `WeeklySummary` with explicit `Comparison` objects.
* Pivoted away from Google Sheets ingestion/auth; data is logged in-app via `logData`.

### Design Notes

* **Auth & roles:** Keep this concept role-agnostic where possible; enforce “coach vs athlete” and “same team” in syncs or callers (e.g., `TeamMembership`, `UserDirectory`).
* **Determinism:** trend arrows derive from prior-week vs current-week numeric comparisons.
* **IDs everywhere:** use `athleteId` (not names) for stable joins.