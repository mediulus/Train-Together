---
timestamp: 'Sun Oct 12 2025 17:39:20 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251012_173920.3701c8e8.md]]'
content_id: c3fb45e7f6dc8131660ab58667b3177be019c1c9e328967b06eed768a2df229c
---

# prompt: TrainingRecords. I made updates with the AI implementation. Add anything that is missing.

concept TrainingRecords:
purpose: Record coach plans (date, percentage, notes) and athlete daily data in one place, and provide simple week-over-week summaries for the dashboard.
principle: After a coach sets a daily plan for an athlete and the athlete logs that day’s data, the system can compute weekly totals/averages and trend arrows (up/down/flat).

```
    state:
        a set of DailyRecords with:
            a date Date
            an athlete User
            coachRecommendations {CoachFields}
            athleteData JSONField

        a set of CoachFields with:
            a percentage Number
            a note String
        
    actions:
        createRecord(coach: User, athlete: User, date: Date, percentage?: Number, note?: String): (record: DailyRecord)
            requires: coach exists and role = coach; athlete exists and role = athlete; no existing DailyRecord for (athlete, date)
            effects: creates a new DailyRecord with optional CoachFields

        updateCoachFields(coach: User, record: DailyRecord, percentage?: Number, note?: String): (record: DailyRecord)
            requires: record exists; coach is the coach of the athlete’s team
            effects: updates coachRecommendations for the record

        logAthleteData(athlete: User, record: DailyRecord, data: JSONField): (record: DailyRecord)
            requires: record exists and belongs to athlete; OR no record exists yet for (athlete, date)
            effects: if no record exists, creates a new DailyRecord with athleteData; otherwise updates athleteData

        updateAthleteData(athlete: User, record: DailyRecord, data: JSONField): (record: DailyRecord)
            requires: record exists and belongs to athlete
            effects: updates the athleteData JSON field

        deleteRecord(actor: User, record: DailyRecord)
            requires: record exists; actor is either the athlete (for athleteData) or the coach of the team (for coachRecommendations)
            effects: deletes the DailyRecord

        computeWeeklySummary(athlete: User, weekStart: Date): (summary: WeeklySummary)
            requires: weekStart is the canonical start of a week
            effects: calculates totals/averages for that week and trends compared to the prior week; does not change stored state
```

AI Augmented Comment
concept TrainingRecords:
**NEW** purpose: Record coach plans and athlete data, compute week-over-week summaries, and—using AI— generate short, factual notes summarizing how an athlete appears to be responding to training. (All data originates from a Google Sheet import; the AI reads the derived weekly summaries.)

```
    **NEW** principle:  Maintain canonical daily records and derive weekly summaries that power the dashboard. Any automation (e.g., AI notes, reminders) reads from these summaries and produces separate, reviewable outputs; it never modifies training data.

    state:
        a set of DailyRecords with:
            a date Date
            an athlete User
            coachRecommendations {CoachFields}
            athleteData {AthleteData}
            mileageRecommendation number
            **NEW** aiRecommendation String

        a set of CoachFields with:
            a percentage Number
            a note String

        a set of AthleteData with
            a mileage number
            a stress number
            a restingHeartRate number
            an excerciseHeartRate number
            a perceivedExertion number
            a notes String

        a WeeklySummary (computed, not stored permanently) with:
            an athlete User
            a weekStart Date
            a totalMileage Number
            an averageStress Number
            an averageSleep Number
            an averageRestingHeartRate Number
            an averageExerciseHeartRate Number
            a trendDirection Enum{up, down, flat}
            a previousWeekComparison {
                mileageChange Number
                stressChange Number
                sleepChange Number
            }?

        
    actions:
        actions (existing unchanged):
            createRecord(coach: User, athlete: User, date: Date, percentage?: Number, note?: String): (record: DailyRecord)
            updateCoachFields(coach: User, record: DailyRecord, percentage?: Number, note?: String): (record: DailyRecord)
            logAthleteData(athlete: User, record: DailyRecord, data: AthleteData): (record: DailyRecord)
            updateAthleteData(athlete: User, record: DailyRecord, data: AthleteData): (record: DailyRecord)
            deleteRecord(actor: User, record: DailyRecord)
            computeWeeklySummary(athlete: User, weekStart: Date): (summary: WeeklySummary)

        NEW action (LLM notes-only):
            summarizeAndRecommend(athlete: User, weekStart: Date): { recommendation: String }
                requires:
                    athlete exists
                    computeWeeklySummary(athlete, weekStart) is available
                effects:
                    - Derives the WeeklySummary for (athlete, weekStart).
                    - Detects missing plan/log days via rule-based checks:
                        * missingCoachData = dates in the week without coachRecommendations
                        * missingAthleteData = dates in the week without athleteData
                    - Calls the LLM with a deterministic prompt to generate ONE short, factual note (<= 200 words)
                    summarizing observations for the week and flagging missing data. No medical advice.
                    - Validators (reject and return error if violated):
                        * length <= 200 words
                        * evidence-only (reference only fields present in WeeklySummary / per-day table)
                        * no medical/prescriptive language; no invented data; respectful tone
                    - On success: stores the same `aiRecommendation` string onto each DailyRecord belonging to
                    (athlete, weekStart..weekStart+6d) for convenient display, and returns { recommendation }.

    syncs:
    UpdateWeeklySummary
        when: WeeklyTick(weekStart, team)
        then: for each athlete on team:
                computeWeeklySummary(athlete, weekStart)
                summarizeAndRecommend(athlete, weekStart)
```

/\*\*

* TrainingRecords Concept - AI Augmented Version
  \*/

import { GeminiLLM } from "./gemini-llm";

// User types
export interface User {
id: string;
name: string;
role: "coach" | "athlete";
teamId?: string;
mileage?: number; // athlete's personal weekly mileage baseline
}

// Date utilities
export interface Date {
year: number;
month: number;
day: number;
}

// Coach recommendations
export interface CoachFields {
percentage: number;
note: string;
}

// Athlete data (flexible JSON structure)
export interface AthleteData {
mileage?: number;
stress?: number; // 1-10 scale
sleep?: number; // hours
restingHeartRate?: number; // resting heart rate in bpm
exerciseHeartRate?: number; // exercise heart rate in bpm
perceivedExertion?: number; // 1-10 scale
notes?: string;
\[key: string]: any; // Allow additional fields
}

// Daily record
export interface DailyRecord {
id: string;
date: Date;
athlete: User;
coachRecommendations?: CoachFields;
athleteData?: AthleteData;
mileageRecommendation?: number;
aiRecommendation?: string;
}

// Weekly summary
export interface WeeklySummary {
athlete: User;
weekStart: Date;
totalMileage: number;
averageStress: number;
averageSleep: number;
averageRestingHeartRate: number;
averageExerciseHeartRate: number;
trendDirection: "up" | "down" | "flat";
previousWeekComparison?: {
mileageChange: number;
stressChange: number;
sleepChange: number;
};
}

export class TrainingRecords {
private records: DailyRecord\[] = \[];
private users: User\[] = \[];
private nextId = 1;

// User management
addUser(user: User): void {
this.users.push(user);
}

getUser(id: string): User | undefined {
return this.users.find((u) => u.id === id);
}

// Date utilities
private dateToString(date: Date): string {
return `${date.year}-${date.month.toString().padStart(2, "0")}-${date.day
      .toString()
      .padStart(2, "0")}`;
}

private getWeekStart(date: Date): Date {
// Simple week start calculation (Monday)
const d = new globalThis.Date(date.year, date.month - 1, date.day);
const day = d.getDay();
const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
d.setDate(diff);
return {
year: d.getFullYear(),
month: d.getMonth() + 1,
day: d.getDate(),
};
}

private getTotalMileageThisWeek(athlete: User, onDate: Date): number {
const weekStart = this.getWeekStart(onDate);
const weekEnd = this.addDays(weekStart, 6);

```
const onOrAfter = (d: Date, a: Date) =>
  (d.year > a.year) ||
  (d.year === a.year && d.month > a.month) ||
  (d.year === a.year && d.month === a.month && d.day >= a.day);

const onOrBefore = (d: Date, b: Date) =>
  (d.year < b.year) ||
  (d.year === b.year && d.month < b.month) ||
  (d.year === b.year && d.month === b.month && d.day <= b.day);

return this.records
  .filter(r =>
    r.athlete.id === athlete.id &&
    onOrAfter(r.date, weekStart) &&
    onOrBefore(r.date, weekEnd)
  )
  .reduce((sum, r) => sum + (r.athleteData?.mileage ?? 0), 0);
```

}

private addDays(date: Date, days: number): Date {
const d = new globalThis.Date(date.year, date.month - 1, date.day);
d.setDate(d.getDate() + days);
return {
year: d.getFullYear(),
month: d.getMonth() + 1,
day: d.getDate(),
};
}

// Basic CRUD operations
createRecord(
coach: User,
athlete: User,
date: Date,
percentage?: number,
note?: string
): DailyRecord {
// Validation
if (coach.role !== "coach") {
throw new Error("Only coaches can create records");
}
if (athlete.role !== "athlete") {
throw new Error("Only athletes can have records");
}

```
// Check for existing record
const existing = this.records.find(
  (r) =>
    r.athlete.id === athlete.id &&
    r.date.year === date.year &&
    r.date.month === date.month &&
    r.date.day === date.day
);
if (existing) {
  throw new Error("Record already exists for this athlete on this date");
}

// ✅ use athlete's baseline mileage (personal characteristic)
const baselineWeeklyMileage = athlete.mileage ?? 0;

const pct = percentage ?? undefined; // keep 0 valid if passed
const mileageRecommendation =
  pct !== undefined
    ? Math.round(baselineWeeklyMileage * (pct / 100) * 10) / 10
    : 0;

const record: DailyRecord = {
  id: this.nextId.toString(),
  date,
  athlete,
  coachRecommendations:
    percentage !== undefined || note !== undefined
      ? {
          percentage: percentage ?? 0,
          note: note ?? "",
        }
      : undefined,
  mileageRecommendation,
};

this.records.push(record);
this.nextId++;
return record;
```

}

updateCoachFields(
coach: User,
record: DailyRecord,
percentage?: number,
note?: string
): DailyRecord {
if (coach.role !== "coach") {
throw new Error("Only coaches can update coach fields");
}

```
const newPct =
  percentage !== undefined
    ? percentage
    : record.coachRecommendations?.percentage ?? 0;

record.coachRecommendations = {
  percentage: newPct,
  note: note !== undefined ? note : record.coachRecommendations?.note ?? "",
};

//  Recompute mileage recommendation when % changes
const athleteMileage = this.getAthleteMileage(record.athlete);
record.mileageRecommendation =
  newPct !== undefined
    ? Math.round(athleteMileage * (newPct / 100) * 10) / 10
    : 0;

return record;
```

}

logAthleteData(
athlete: User,
record: DailyRecord,
data: AthleteData
): DailyRecord {
if (athlete.role !== "athlete") {
throw new Error("Only athletes can log athlete data");
}
if (record.athlete.id !== athlete.id) {
throw new Error("Athlete can only log data for their own records");
}

```
record.athleteData = data;
return record;
```

}

getAthleteMileage(athlete: User): number {
return this.records
.filter((r) => r.athlete.id === athlete.id)   // take only that athlete’s records
.reduce((sum, r) => sum + (r.athleteData?.mileage || 0), 0);
}

updateAthleteData(
athlete: User,
record: DailyRecord,
data: AthleteData
): DailyRecord {
if (athlete.role !== "athlete") {
throw new Error("Only athletes can update athlete data");
}
if (record.athlete.id !== athlete.id) {
throw new Error("Athlete can only update data for their own records");
}

```
record.athleteData = { ...record.athleteData, ...data };
return record;
```

}

deleteRecord(actor: User, record: DailyRecord): void {
const recordIndex = this.records.findIndex((r) => r.id === record.id);
if (recordIndex === -1) {
throw new Error("Record not found");
}

```
// Check permissions
if (actor.role === "athlete" && record.athlete.id !== actor.id) {
  throw new Error("Athletes can only delete their own records");
}
if (actor.role === "coach" && record.athlete.teamId !== actor.teamId) {
  throw new Error(
    "Coaches can only delete records for athletes on their team"
  );
}

this.records.splice(recordIndex, 1);
```

}

private checkMissingCoachData(athlete: User, weekStart: Date): string\[] {
const missingDays: string\[] = \[];
for (let i = 0; i < 7; i++) {
const date = this.addDays(weekStart, i);
const record = this.records.find(
(r) =>
r.athlete.id === athlete.id &&
r.date.year === date.year &&
r.date.month === date.month &&
r.date.day === date.day
);

```
  if (!record || !record.coachRecommendations) {
    missingDays.push(this.dateToString(date));
  }
}
return missingDays;
```

}

private checkMissingAthleteData(athlete: User, weekStart: Date): string\[] {
const missingDays: string\[] = \[];
for (let i = 0; i < 7; i++) {
const date = this.addDays(weekStart, i);
const record = this.records.find(
(r) =>
r.athlete.id === athlete.id &&
r.date.year === date.year &&
r.date.month === date.month &&
r.date.day === date.day
);

```
  if (!record || !record.athleteData) {
    missingDays.push(this.dateToString(date));
  }
}
return missingDays;
```

}

computeWeeklySummary(athlete: User, weekStart: Date): WeeklySummary {
const weekEnd = this.addDays(weekStart, 6);

```
// Get all records for this athlete in this week
const weekRecords = this.records.filter((r) => {
  if (r.athlete.id !== athlete.id) return false;
  const recordDate = r.date;
  return (
    (recordDate.year > weekStart.year ||
      (recordDate.year === weekStart.year &&
        recordDate.month > weekStart.month) ||
      (recordDate.year === weekStart.year &&
        recordDate.month === weekStart.month &&
        recordDate.day >= weekStart.day)) &&
    (recordDate.year < weekEnd.year ||
      (recordDate.year === weekEnd.year &&
        recordDate.month < weekEnd.month) ||
      (recordDate.year === weekEnd.year &&
        recordDate.month === weekEnd.month &&
        recordDate.day <= weekEnd.day))
  );
});

// Calculate totals and averages
let totalMileage = 0;
let totalStress = 0;
let totalSleep = 0;
let totalRestingHeartRate = 0;
let totalExerciseHeartRate = 0;
let validStressCount = 0;
let validSleepCount = 0;
let validRestingHeartRateCount = 0;
let validExerciseHeartRateCount = 0;

for (const record of weekRecords) {
  if (record.athleteData?.mileage) {
    totalMileage += record.athleteData.mileage;
  }
  if (record.athleteData?.stress !== undefined) {
    totalStress += record.athleteData.stress;
    validStressCount++;
  }
  if (record.athleteData?.sleep !== undefined) {
    totalSleep += record.athleteData.sleep;
    validSleepCount++;
  }
  if (record.athleteData?.restingHeartRate !== undefined) {
    totalRestingHeartRate += record.athleteData.restingHeartRate;
    validRestingHeartRateCount++;
  }
  if (record.athleteData?.exerciseHeartRate !== undefined) {
    totalExerciseHeartRate += record.athleteData.exerciseHeartRate;
    validExerciseHeartRateCount++;
  }
}

const averageStress =
  validStressCount > 0 ? totalStress / validStressCount : 0;
const averageSleep = validSleepCount > 0 ? totalSleep / validSleepCount : 0;
const averageRestingHeartRate =
  validRestingHeartRateCount > 0
    ? totalRestingHeartRate / validRestingHeartRateCount
    : 0;
const averageExerciseHeartRate =
  validExerciseHeartRateCount > 0
    ? totalExerciseHeartRate / validExerciseHeartRateCount
    : 0;

// Calculate trend direction (simplified - avoid recursion for now)
let trendDirection: "up" | "down" | "flat" = "flat";

// Simple trend calculation based on current week data
if (weekRecords.length >= 2) {
  const sortedRecords = weekRecords.sort((a, b) => {
    if (a.date.year !== b.date.year) return a.date.year - b.date.year;
    if (a.date.month !== b.date.month) return a.date.month - b.date.month;
    return a.date.day - b.date.day;
  });

  const firstHalf = sortedRecords.slice(
    0,
    Math.floor(sortedRecords.length / 2)
  );
  const secondHalf = sortedRecords.slice(
    Math.floor(sortedRecords.length / 2)
  );

  const firstHalfMileage = firstHalf.reduce(
    (sum, r) => sum + (r.athleteData?.mileage || 0),
    0
  );
  const secondHalfMileage = secondHalf.reduce(
    (sum, r) => sum + (r.athleteData?.mileage || 0),
    0
  );

  if (secondHalfMileage > firstHalfMileage * 1.1) {
    trendDirection = "up";
  } else if (secondHalfMileage < firstHalfMileage * 0.9) {
    trendDirection = "down";
  }
}

return {
  athlete,
  weekStart,
  totalMileage,
  averageStress,
  averageSleep,
  averageRestingHeartRate,
  averageExerciseHeartRate,
  trendDirection,
  previousWeekComparison: {
    mileageChange: 0, // Simplified for now
    stressChange: 0,
    sleepChange: 0,
  },
};
```

}

// AI Augmentation - Main method
async summarizeAndRecommend(
athlete: User,
llm: GeminiLLM,
weekStartDate: Date
): Promise<{ recommendation: string }> {
try {
console.log(`🤖 Generating AI recommendation for ${athlete.name}...`);

```
  const weeklySummary = this.computeWeeklySummary(athlete, weekStartDate);
  const missingCoachData = this.checkMissingCoachData(athlete, weekStartDate);
  const missingAthleteData = this.checkMissingAthleteData(athlete, weekStartDate);

  // Optional: collect a compact per-day table for the week (no “new” data)
  const weekDays: { date: string; mileage?: number; stress?: number; sleep?: number; rhr?: number; ehr?: number; pe?: number }[] =
    Array.from({ length: 7 }, (_, i) => {
      const date = this.addDays(weekStartDate, i);
      const rec = this.records.find(r =>
        r.athlete.id === athlete.id &&
        r.date.year === date.year &&
        r.date.month === date.month &&
        r.date.day === date.day
      );
      const d = rec?.athleteData;
      return {
        date: this.dateToString(date),
        mileage: d?.mileage,
        stress: d?.stress,
        sleep: d?.sleep,
        rhr: d?.restingHeartRate,
        ehr: d?.exerciseHeartRate,
        pe: d?.perceivedExertion,
      };
    });

  const prompt = this.createRecommendationPrompt(
    weeklySummary,
    missingCoachData,
    missingAthleteData,
    weekDays // new optional param
  );

  const response = await llm.executeLLM(prompt);
  console.log("✅ Received AI recommendation!");
  console.log("\n🤖 RAW GEMINI RESPONSE");
  console.log("======================");
  console.log(response);
  console.log("======================\n");
  return { recommendation: response };
} catch (error) {
  console.error("❌ Error generating AI recommendation:", (error as Error).message);
  throw error;
}
```

}

private createRecommendationPrompt(
weeklySummary: WeeklySummary,
missingCoachData: string\[],
missingAthleteData: string\[],
weekDays?: {
date: string;
mileage?: number;
stress?: number;
sleep?: number;
rhr?: number;
ehr?: number;
pe?: number;
}\[]
): string {
const dailyLines = (weekDays ?? \[])
.map((d) =>
`- ${d.date}:` +
` mileage=${d.mileage ?? "N/A"},` +
` stress=${d.stress ?? "N/A"},` +
` sleep=${d.sleep ?? "N/A"}h,` +
` RHR=${d.rhr ?? "N/A"} bpm,` +
` EHR=${d.ehr ?? "N/A"} bpm,` +
` PE=${d.pe ?? "N/A"}`
)
.join("\n");

```
const weeklyTrendsSection = `
```

WEEKLY TRENDS:

* Total Mileage: ${weeklySummary.totalMileage.toFixed(1)} miles
* Average Stress: ${weeklySummary.averageStress.toFixed(1)}/10
* Average Sleep: ${weeklySummary.averageSleep.toFixed(1)} hours
* Average Resting Heart Rate: ${weeklySummary.averageRestingHeartRate.toFixed(0)} bpm
* Average Exercise Heart Rate: ${weeklySummary.averageExerciseHeartRate.toFixed(0)} bpm
* Trend Direction: ${weeklySummary.trendDirection}
* Mileage Change: ${weeklySummary.previousWeekComparison?.mileageChange.toFixed?.(1) ?? "N/A"} miles
* Stress Change: ${weeklySummary.previousWeekComparison?.stressChange.toFixed?.(1) ?? "N/A"}/10
* Sleep Change: ${weeklySummary.previousWeekComparison?.sleepChange.toFixed?.(1) ?? "N/A"} hours\`;

  const missingDataSection = \`
  MISSING DATA ALERTS:
* Coach hasn't set plan for: ${missingCoachData.length > 0 ? missingCoachData.join(", ") : "None"}
* Athlete hasn't logged data for: ${missingAthleteData.length > 0 ? missingAthleteData.join(", ") : "None"}\`;

  const dailySection =
  weekDays && weekDays.length ? `\nDAILY LOGS (this week):\n${dailyLines}\n` : "";

  return \`
  You are an AI assistant helping coaches analyze athlete training data and provide actionable insights.

${weeklyTrendsSection}
${dailySection}
${missingDataSection}

INSTRUCTIONS:

1. Use knowledge from previous weeks to see trends
2. Look for persistent, multi-signal patterns only: e.g., changes that last ≥2 consecutive days and co-occur.
3. **CONCERNING TRENDS:** A trend is concerning if, on **any easy or recovery day**, the athlete logs RHR **5+ bpm above the week’s lowest RHR** for **≥2 consecutive days**, **AND** on those same days, stress is **≥6/10** or sleep is **≤6.5 hours**. This indicates potential overreaching/fatigue.
4. Treat hard sessions (threshold/long runs) as expected strain; do not flag single-day spikes tied to these workouts.
5. Keep language neutral and non-causal (“signals suggest” vs. “indicates”), and focus on brief, actionable coaching steps (2–3 sentences max).
6. **INSUFFICIENT DATA :** If **3 or more daily logs** are completely missing (mileage, stress, sleep, RHR, EHR, PE all 'N/A'), the analysis is compromised. In this case, **ONLY** output the text: **“Insufficient data for meaningful analysis. Please ensure consistent daily logging of all metrics.”**
7. If the number of completely missing logs is **less than 3**, proceed with trend analysis (Rule 3/4/8), but list the specific missing dates at the end.
8. If no pattern meets the above thresholds (Rule 3) and data is sufficient (Rule 6), state "No concerning trends were observed this week. The athlete maintained consistency, and key recovery signals remain stable."

CRITICAL REQUIREMENTS:

* Keep recommendations under 200 words.
* Avoid medical terminology or diagnoses.
* Only reference data present in the week’s logs; if values are missing, acknowledge that.
* If there's insufficient data for analysis (Rule 6), state the exact required text.
* Clarify what dates you are referring to in your analysis.

ANTI-HALLUCINATION RULES - CRITICAL:

* NEVER invent or assume any data not provided in the week’s logs.
* If the week shows zeros or missing fields, reflect that explicitly.
* Do not reference specific workouts/paces unless present.

Return only the recommendation text, no additional formatting or explanations.\`;
}

// Helper methods for testing
getRecords(): DailyRecord\[] {
return \[...this.records];
}

getUsers(): User\[] {
return \[...this.users];
}

// Display methods
displayRecords(): void {
console.log("\n📊 Training Records");
console.log("==================");

```
    if (this.records.length === 0) {
    console.log("No records found.");
    return;
    }

    // Group by athlete
    const byAthlete = new Map<string, DailyRecord[]>();
    for (const record of this.records) {
    const athleteId = record.athlete.id;
    if (!byAthlete.has(athleteId)) {
        byAthlete.set(athleteId, []);
    }
    byAthlete.get(athleteId)!.push(record);
    }

    for (const [athleteId, records] of byAthlete) {
    const athlete = records[0].athlete;
    console.log(`\n👤 ${athlete.name} (${athlete.id})`);
    console.log(`Baseline weekly mileage for ${athlete.name}: ${athlete.mileage} mi`);

    for (const record of records.sort((a, b) => {
        if (a.date.year !== b.date.year) return a.date.year - b.date.year;
        if (a.date.month !== b.date.month) return a.date.month - b.date.month;
        return a.date.day - b.date.day;
    })) {
        const dateStr = this.dateToString(record.date);
        console.log(`  📅 ${dateStr}`);

        if (record.coachRecommendations) {
        console.log(
            `    Coach: ${record.coachRecommendations.percentage}% - ${record.coachRecommendations.note}`
        );
        } else {
        console.log(`    Coach: No plan set`);
        }

        if (record.athleteData) {
        const data = record.athleteData;
        console.log(
            `    Athlete: ${data.mileage !== undefined ? data.mileage : "N/A"} miles, ` +
            `Stress: ${data.stress !== undefined ? data.stress : "N/A"}/10, ` +
            `Sleep: ${data.sleep !== undefined ? data.sleep : "N/A"}h, ` +
            `RHR: ${data.restingHeartRate !== undefined ? data.restingHeartRate : "N/A"} bpm, ` +
            `EHR: ${data.exerciseHeartRate !== undefined ? data.exerciseHeartRate : "N/A"} bpm, ` +
            `PE: ${data.perceivedExertion !== undefined ? data.perceivedExertion : "N/A"}/10`
        );
        if (data.notes !== undefined && data.notes !== "") {
            console.log(`    Notes: ${data.notes}`);
        }
        } else {
        console.log(`    Athlete: No data logged`);
        }

        if (record.mileageRecommendation !== undefined) {
        console.log(`    Recommendation: ${record.mileageRecommendation} miles`);
        }

        if (record.aiRecommendation) {
        console.log(`    🤖 AI: ${record.aiRecommendation}`);
        }
    }
    }
}
```

}
