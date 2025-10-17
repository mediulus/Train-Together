---
timestamp: 'Thu Oct 16 2025 13:02:08 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_130208.6242d2d9.md]]'
content_id: 43139509cc07aeca45ed80a8e7a1f2196f719684dba3a3e9b8bbe9c8c1fa13b4
---

# test: TrainingRecords. write tests that follows the operational principle where an some athlete data is created and the a weekly summary is generated.

concept TrainingRecords \[User]:

purpose: Record athlete data and ultimately provide a weekly summary dashboard for each athlete. This dashboard displays trends from previous weeks, helping to identify issues or concerns in their training over time.

principle: Each athlete logs their daily data into the logger, which is then stored and aggregated into a weekly summary chart. This chart highlights changes in their training and the direction of trends, enabling athletes to observe both positive and negative impacts resulting from their training routines.

```
    state:

        a set of AthleteData with
            a athleteID: User
            a day Date
            a mileage number
            a stress number
            a sleep number
            a restingHeartRate number
            an excerciseHeartRate number
            a perceivedExertion number
            a notes String

        a set of Comparisons with
          an activityMetric Number
          a trendDirections Enum{up,down,flat}
        
        a WeeklySummary with
            an athleteId User
            a weekStart Date
            a mileageSoFar Number
            an averageStress Comparison
            an averageSleep Comparison
            an averageRestingHeartRate Comparison
            an averageExerciseHeartRate Comparison
            an averagePerceivedExertion Comparison
            an athleteDataDailyCollection {AthleteData}
        
    actions:
        actions:
          createWeeklySummary(athlete: User, todaysDate: Date): WeeklySummary
            requires: athlete exists, and athelt e has role = athlete, requester exists and is a coach, caoch and athlete are on same team
            effects: uses todaysDate to find the week sunday-saturday that the week falls in and acquires all of the athletes datas from that week and the week prior and calculates averages and changes from the previous week and generates a weekly summary 
          
          logData(date: Date, athlete: User, loggValues...): AthleteData
            requires: 
              - all log values are valid keys
              - athlete exists
              - athlete has role = athlete
            effects: edits or logs an athlete's data from that day with the corresponding log values
```

import { Collection, Db } from "npm:mongodb";
import { ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import {User} from "../UserDirectory/UserDirectoryConcept.ts";

export interface AthleteData {
id: ID;
athlete: User;
day: Date;
mileage?: number;
stress?: number; // 1-10 scale
sleep?: number; // hours
restingHeartRate?: number; // resting heart rate in bpm
exerciseHeartRate?: number; // exercise heart rate in bpm
perceivedExertion?: number; // 1-10 scale
notes?: string;
}

export interface ComparisonMetrics {
averageActivityMetric: number | null;
trendDirection: "up" | "down" | "flat";
}

export interface WeeklySummary {
athlete: User;
weekStart: Date;
mileageSoFar: number;
averageStress: ComparisonMetrics;
averageSleep: ComparisonMetrics;
averageRestingHeartRate: ComparisonMetrics;
averageExerciseHeartRate: ComparisonMetrics;
averagePerceivedExertion: ComparisonMetrics;
athleteDataDailyCollectionForWeek: AthleteData\[];
}

const PREFIX = "TrainingRecords" + ".";

///// WEEKLY SUMMARY HELPER FUNCTIONS
function atMidnight(d: Date): Date {
const x = new Date(d);
x.setHours(0, 0, 0, 0);
return x;
}
function sundayOf(date: Date): Date {
const d = atMidnight(date);
const day = d.getDay(); // 0 = Sun
const out = new Date(d);
out.setDate(d.getDate() - day);
return out;
}

function saturdayOf(date: Date): Date {
const s = sundayOf(date);
const out = new Date(s);
out.setDate(s.getDate() + 6);
return out;
}

function calculateMetrics(
data: AthleteData\[],
fields: (keyof AthleteData)\[],
): { totalMileage: number; averages: Record\<string, number | null> } {
let totalMileage = 0;
const sums: Record\<string, number> = {};
const counts: Record\<string, number> = {};

for (const field of fields) {
sums\[field as string] = 0;
counts\[field as string] = 0;
}

for (const record of data) {
totalMileage += record.mileage ?? 0;
for (const field of fields) {
const value = record\[field as keyof AthleteData];
if (typeof value === "number" && value !== null && !isNaN(value)) {
sums\[field as string] += value;
counts\[field as string]++;
}
}
}

const averages: Record\<string, number | null> = {};
for (const field of fields) {
averages\[field as string] = counts\[field as string] > 0
? sums\[field as string] / counts\[field as string]
: null;
}

return { totalMileage, averages };
}

function compareAverages(
currentAvg: number | null,
prevAvg: number | null,
): ComparisonMetrics {
if (currentAvg === null && prevAvg === null) {
return { averageActivityMetric: null, trendDirection: "flat" };
}
if (currentAvg === null) { // Prev exists, current doesn't
return { averageActivityMetric: null, trendDirection: "down" };
}
if (prevAvg === null) { // Current exists, prev doesn't
return { averageActivityMetric: currentAvg, trendDirection: "up" };
}

// Both averages exist, compare them
// Define a small tolerance for "flat" to avoid micro-changes causing trends
const tolerance = 0.01;

const diff = currentAvg - prevAvg;

const trend: "up" | "down" | "flat" = Math.abs(diff) < tolerance
? "flat"
: diff > 0
? "up"
: "down";

return { averageActivityMetric: currentAvg, trendDirection: trend };
}

export default class TrainingRecordsConcept {
private weeklyRecords: Collection<WeeklySummary>;
private athleteData: Collection<AthleteData>;

constructor(
private readonly db: Db,
) {
this.weeklyRecords = db.collection<WeeklySummary>(PREFIX + "weeklyRecords");
this.athleteData = db.collection<AthleteData>(PREFIX + "athleteData");
this.athleteData = db.collection<AthleteData>(PREFIX + "athleteData");
}

/\*\*

* @requires all logs are valid keys
* @effects edits or logs an athlete's data from that day with the corresponding log values
*
* @param date The date of the log entry
* @param athlete The athlete object
* @param logValues The values to log (partial AthleteData without athleteId and day)
*
* @returns The updated or created AthleteData entry, or an error message
  \*/
  async logData(date: Date, athlete: User, logValues: Partial\<Omit\<AthleteData, "athlete" | "day">>,
  ): Promise\<AthleteData | { error: string }> {
  //validate all log values are valid keys
  const validKeys: (keyof Omit\<AthleteData, "athleteId" | "day">)\[] = \[
  "mileage",
  "stress",
  "sleep",
  "restingHeartRate",
  "exerciseHeartRate",
  "perceivedExertion",
  "notes",
  ];
  for (const key of Object.keys(logValues)) {
  if (
  !validKeys.includes(key as keyof Omit\<AthleteData, "athleteId" | "day">)
  ) {
  return { error: `Invalid log key: ${key}` };
  }
  }

```
const day = atMidnight(date);
```

```
// Check if an entry already exists for this athlete and day
const existingEntry = await this.athleteData.findOne({
  
  athleteId: athlete,
  day: day,
});

if (existingEntry) {
  // Update the existing entry with new log values
  const updatedEntry = { ...existingEntry, ...logValues };
  await this.athleteData.updateOne(
    { _id: existingEntry._id },
    { $set: updatedEntry },
  );
  return updatedEntry;
} else {
  // Create a new entry
  const newEntry: AthleteData = {
    id: freshID(),
    athlete: athlete,
    day: day,
    ...logValues,
  };
  await this.athleteData.insertOne(newEntry);
  return newEntry;
}
```

}

/\*\*

* Creates a weekly summary for the given athlete without the AI recommendation.
*
* @requires there is athlete data for the week
* @effects uses todaysDate to find the week sunday-saturday that the
* ```
       week falls in and acquires all of the athletes datas from
  ```
* ```
       that week and the week prior and calculates averages and
  ```
* ```
       changes from the previous week and generates a weekly summary
  ```
* ```
       without the ai recomendation yet
  ```
*
* @param requester - The ID of the requester (coach)
* @param athlete - The ID of the athlete
* @param todaysDate - The current date
*
* @returns A promise that resolves to the weekly summary or an error message
  \*/
  async createWeeklySummary(athlete: User, todaysDate: Date): Promise\<WeeklySummary | { error: string }> {
  //find the week range (sunday-saturday) for todaysDate
  const weekStart = sundayOf(todaysDate);
  const weekEnd = saturdayOf(todaysDate);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(weekStart.getDate() - 7);
  const prevWeekEnd = new Date(prevWeekStart);
  prevWeekEnd.setDate(prevWeekStart.getDate() + 6);

```
// Fetch current week's data from the database
```

```
const currentWeekData: AthleteData[] = await this.athleteData.find({
  athleteId: athlete,
  day: { $gte: atMidnight(weekStart), $lte: atMidnight(weekEnd) }
}).sort({ day: 1 }).toArray(); 
if (currentWeekData.length === 0) {
    return { error: "No athlete data found for the current week." };
}

// Fetch previous week's data from the database
const prevWeekData = await this.athleteData.find({
  athleteId: athlete,
  day: { $gte: atMidnight(prevWeekStart), $lte: atMidnight(prevWeekEnd) }
}).toArray();

 const metricFields: (keyof AthleteData)[] = [
    "stress", 
    "sleep", 
    "restingHeartRate", 
    "exerciseHeartRate", 
    "perceivedExertion"
];

const currentMetrics = calculateMetrics(currentWeekData, metricFields);
const prevMetrics = calculateMetrics(prevWeekData, metricFields);

// Build the weekly summary
const weeklySummary: WeeklySummary = {
    athlete: athlete,
    weekStart: weekStart,
    mileageSoFar: currentMetrics.totalMileage,
    athleteDataDailyCollectionForWeek: currentWeekData,
    averageStress: compareAverages(currentMetrics.averages.stress, prevMetrics.averages.stress),
    averageSleep: compareAverages(currentMetrics.averages.sleep, prevMetrics.averages.sleep),
    averageRestingHeartRate: compareAverages(currentMetrics.averages.restingHeartRate, prevMetrics.averages.restingHeartRate),
    averageExerciseHeartRate: compareAverages(currentMetrics.averages.exerciseHeartRate, prevMetrics.averages.exerciseHeartRate),
    averagePerceivedExertion: compareAverages(currentMetrics.averages.perceivedExertion, prevMetrics.averages.perceivedExertion),
};

try {
    await this.weeklyRecords.updateOne(
        { athleteId: athlete, weekStart: weekStart },
        { $set: weeklySummary },
        { upsert: true }
    );
} catch (e) {
    console.error("Database error creating weekly summary:", e);
    return { error: "Failed to store weekly summary due to a database error." };
}

// Return the generated object
return weeklySummary;
```

}
}
