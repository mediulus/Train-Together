import { Collection, Db } from "mongodb";
import { ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { User, UserID } from "../UserDirectory/UserDirectoryConcept.ts";

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
  athleteDataDailyCollectionForWeek: AthleteData[];
}

const PREFIX = "TrainingRecords" + ".";

///// WEEKLY SUMMARY HELPER FUNCTIONS
function atMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Helper to parse a date string (YYYY-MM-DD) in local timezone
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function sundayOf(d: Date): Date {
  const x = atMidnight(d);
  const day = x.getDay(); // 0 = Sun
  const out = new Date(x);
  out.setDate(x.getDate() - day);
  return out;
}
function nextSunday(startSunday: Date): Date {
  const out = new Date(startSunday);
  out.setDate(out.getDate() + 7);
  return out;
}

export function calculateMetrics(
  data: AthleteData[],
  fields: (keyof AthleteData)[]
): { totalMileage: number; averages: Record<string, number | null> } {
  let totalMileage = 0;
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  for (const field of fields) {
    sums[field as string] = 0;
    counts[field as string] = 0;
  }

  for (const record of data) {
    if (record.mileage !== undefined) {
      totalMileage += record.mileage;
    }
    for (const field of fields) {
      const value = record[field as keyof AthleteData];
      if (typeof value === "number" && value !== null && !isNaN(value)) {
        sums[field as string] += value;
        counts[field as string]++;
      }
    }
  }

  const averages: Record<string, number | null> = {};
  for (const field of fields) {
    averages[field as string] =
      counts[field as string] > 0
        ? sums[field as string] / counts[field as string]
        : null;
  }

  return { totalMileage, averages };
}

export function compareAverages(
  currentAvg: number | null,
  prevAvg: number | null
): ComparisonMetrics {
  if (currentAvg === null && prevAvg === null) {
    return { averageActivityMetric: null, trendDirection: "flat" };
  }
  if (currentAvg === null) {
    // Prev exists, current doesn't
    return { averageActivityMetric: null, trendDirection: "down" };
  }
  if (prevAvg === null) {
    // Current exists, prev doesn't
    return { averageActivityMetric: currentAvg, trendDirection: "up" };
  }

  // Both averages exist, compare them
  // Define a small tolerance for "flat" to avoid micro-changes causing trends
  const tolerance = 0.01;

  const diff = currentAvg - prevAvg;

  const trend: "up" | "down" | "flat" =
    Math.abs(diff) < tolerance ? "flat" : diff > 0 ? "up" : "down";

  return { averageActivityMetric: currentAvg, trendDirection: trend };
}

export default class TrainingRecordsConcept {
  private weeklyRecords: Collection<WeeklySummary>;
  private athleteData: Collection<AthleteData>;
  private users: Collection<User>;

  constructor(private readonly db: Db) {
    this.weeklyRecords = this.db.collection<WeeklySummary>(PREFIX + "weeklyRecords");
    this.athleteData = this.db.collection<AthleteData>(PREFIX + "athleteData");
    this.users = this.db.collection<User>("UserDirectory.users");

    // Helpful indexes
    void this.athleteData.createIndex(
      { "athlete._id": 1, day: 1 },
      { unique: true }
    );
  }

  /**
   * @requires all logs are valid keys
   * @effects edits or logs an athlete's data from that day with the corresponding log values
   *
   * @param date The date of the log entry
   * @param athlete The athlete object
   * @param logValues The values to log (partial AthleteData without athleteId and day)
   *
   * @returns The updated or created AthleteData entry, or an error message
   */
  async logData(
    date: Date,
    athlete: User,
    logValues: Partial<Omit<AthleteData, "athlete" | "day">>
  ): Promise<AthleteData | { error: string }> {
    //validate all log values are valid keys
    const validKeys: (keyof Omit<AthleteData, "athlete" | "day">)[] = [
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
        !validKeys.includes(key as keyof Omit<AthleteData, "athlete" | "day">)
      ) {
        return { error: `Invalid log key: ${key}` };
      }
    }

    // Filter out null and undefined values - only update fields with actual values
    const filteredValues: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(logValues)) {
      if (value !== null && value !== undefined) {
        filteredValues[key] = value as number | string;
      }
    }

    const day = atMidnight(date);

    // Check if an entry already exists for this athlete and day
    const existingEntry = await this.athleteData.findOne({
      "athlete._id": athlete._id,
      day: day,
    });

    if (existingEntry) {
      // Only update if there are values to set
      if (Object.keys(filteredValues).length > 0) {
       
        await this.athleteData.updateOne(
          { _id: existingEntry._id },
          { $set: filteredValues }
        );
      } else {
        console.log("No values to update for existing entry on:", day);
      }
      
      // Fetch and return the updated entry from database
      const updatedEntry = await this.athleteData.findOne({ _id: existingEntry._id });
      if (!updatedEntry) {
        return { error: "Failed to retrieve updated entry." };
      }
      return updatedEntry;
    } else {
      // Create a new entry
      const newEntry: AthleteData = {
        id: freshID(),
        athlete: athlete,
        day: day,
        ...filteredValues,
      };
      await this.athleteData.insertOne(newEntry);
      
      // Fetch and return the newly created entry from database
      const createdEntry = await this.athleteData.findOne({
        "athlete._id": athlete._id,
        day: day,
      });
      if (!createdEntry) {
        return { error: "Failed to retrieve created entry." };
      }
      console.log("Created entry:", createdEntry);
      return createdEntry;
    }
  }

  /**
   * HTTP-friendly wrapper: log an entry for a user by ID
   * Expects body: { userId: string, date: string|Date, mileage?, stress?, sleep?, restingHeartRate?, exerciseHeartRate?, perceivedExertion?, notes? }
   */
  async logDailyEntry(input: {
    userId?: UserID;
    date?: string | Date;
    mileage?: number;
    stress?: number;
    sleep?: number;
    restingHeartRate?: number;
    exerciseHeartRate?: number;
    perceivedExertion?: number;
    notes?: string;
  }): Promise<AthleteData | { error: string }> {
    try {

      const userId = input.userId;
      if (!userId) return { error: "Missing userId." };
      
      // Parse date properly - if it's a string in YYYY-MM-DD format, use parseLocalDate
      let date: Date | undefined;
      if (input.date) {
        if (typeof input.date === 'string') {
          date = parseLocalDate(input.date);
        } else {
          date = new Date(input.date);
        }
      }

      if (!date || isNaN(date.getTime()))
        return { error: "Invalid or missing date." };

      const athlete = await this.users.findOne({ _id: userId });
      if (!athlete) return { error: "User not found." };

      // Extract all the log values (everything except userId and date)
      const { userId: _, date: __, ...logValues } = input;

      return await this.logData(date, athlete, logValues);
    } catch (e) {
      console.error("logDailyEntry failed:", e);
      return { error: "Failed to log entry." };
    }
  }

  /**
   * HTTP-friendly: list entries for a user, optional date range
   * Expects input: { userId: string, from?: string|Date, to?: string|Date }
   */
  async listEntries(input: {
    userId?: UserID;
    from?: string | Date;
    to?: string | Date;
  }): Promise<{ entries: AthleteData[] } | { error: string }> {
    try {
      
      const userId = input.userId;
      if (!userId) return { error: "Missing userId." };
      
      const athlete = await this.users.findOne({ _id: userId });
      if (!athlete) return { error: "User not found." };

      // Build the query
      const query: {
        "athlete._id": UserID;
        day?: { $gte?: Date; $lt?: Date };
      } = { "athlete._id": userId };
      
      // Add date range if provided
      if (input.from || input.to) {
        query.day = {};
        
        if (input.from) {
          const fromDate = new Date(input.from);
          if (!isNaN(fromDate.getTime())) {
            query.day.$gte = atMidnight(fromDate);
          }
        }
        
        if (input.to) {
          const toDate = new Date(input.to);
          if (!isNaN(toDate.getTime())) {
            const exclusiveEnd = atMidnight(toDate);
            exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
            query.day.$lt = exclusiveEnd;
          }
        }
      }

      
      const entries = await this.athleteData
        .find(query)
        .sort({ day: 1 })
        .toArray();

      console.log('these are the listed entries:', entries);
      return { entries };
    } catch (e) {
      console.error("listEntries failed:", e);
      return { error: "Failed to list entries." };
    }
  }

  /**
   * Creates a weekly summary for the given athlete without the AI recommendation.
   *
   * @requires there is athlete data for the week
   * @effects uses todaysDate to find the week sunday-saturday that the
   *          week falls in and acquires all of the athletes datas from
   *          that week and the week prior and calculates averages and
   *          changes from the previous week and generates a weekly summary
   *          without the ai recomendation yet
   *
   * @param requester - The ID of the requester (coach)
   * @param athlete - The ID of the athlete
   * @param todaysDate - The current date
   *
   * @returns A promise that resolves to the weekly summary or an error message
   */
  async createWeeklySummary(
    athlete: User,
    todaysDate: Date
  ): Promise<WeeklySummary | { error: string }> {
    //find the week range (sunday-saturday) for todaysDate
    const weekStart = sundayOf(todaysDate); // inclusive
    const weekEndExcl = nextSunday(weekStart);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEndExcl = weekStart;

    // Fetch current week's data from the database
    const currentWeekData = await this.athleteData
      .find({
        athlete: athlete,
        day: { $gte: weekStart, $lt: weekEndExcl },
      })
      .sort({ day: 1 })
      .toArray();

    if (currentWeekData.length === 0) {
      return { error: "No athlete data found for the current week." };
    }

    // Fetch previous week's data from the database
    const prevWeekData = await this.athleteData
      .find({
        athlete: athlete,
        day: { $gte: prevWeekStart, $lt: prevWeekEndExcl },
      })
      .toArray();

    const metricFields: (keyof AthleteData)[] = [
      "stress",
      "sleep",
      "restingHeartRate",
      "exerciseHeartRate",
      "perceivedExertion",
    ];

    const currentMetrics = calculateMetrics(currentWeekData, metricFields);
    const prevMetrics = calculateMetrics(prevWeekData, metricFields);

    // Build the weekly summary
    const weeklySummary: WeeklySummary = {
      athlete: athlete,
      weekStart: weekStart,
      mileageSoFar: currentMetrics.totalMileage,
      athleteDataDailyCollectionForWeek: currentWeekData,
      averageStress: compareAverages(
        currentMetrics.averages.stress,
        prevMetrics.averages.stress
      ),
      averageSleep: compareAverages(
        currentMetrics.averages.sleep,
        prevMetrics.averages.sleep
      ),
      averageRestingHeartRate: compareAverages(
        currentMetrics.averages.restingHeartRate,
        prevMetrics.averages.restingHeartRate
      ),
      averageExerciseHeartRate: compareAverages(
        currentMetrics.averages.exerciseHeartRate,
        prevMetrics.averages.exerciseHeartRate
      ),
      averagePerceivedExertion: compareAverages(
        currentMetrics.averages.perceivedExertion,
        prevMetrics.averages.perceivedExertion
      ),
    };

    try {
      await this.weeklyRecords.updateOne(
        { athlete: athlete, weekStart: weekStart },
        { $set: weeklySummary },
        { upsert: true }
      );
    } catch (e) {
      console.error("Database error creating weekly summary:", e);
      return {
        error: "Failed to store weekly summary due to a database error.",
      };
    }

    // Return the generated object
    return weeklySummary;
  }
}
