import { Collection, Db, MongoClient } from "npm:mongodb"; 
import { ID, Empty } from "@utils/types.ts"; 
import { freshID, getDb } from "@utils/database.ts"; 
import { GeminiLLM } from "./gemini-llm.ts";
import {User} from '../UserDirectory/UserDirectoryConcept.ts'
import { userInfo } from "node:os";

type UserID = ID;
type trainingRecordId = ID;

export interface CoachFields {
  percentage: number;
  note: string;
}

export interface AthleteData {
  mileage?: number;
  stress?: number; // 1-10 scale
  sleep?: number; // hours
  restingHeartRate?: number; // resting heart rate in bpm
  exerciseHeartRate?: number; // exercise heart rate in bpm
  perceivedExertion?: number; // 1-10 scale
  notes?: string;
  [key: string]: any; // Allow additional fields
}

export interface DailyRecord {
  _id: ID; // MongoDB document ID
  date: string; // Stored as YYYY-MM-DD string
  athleteId: ID; // Reference to the athlete's ID
  coachRecommendations?: CoachFields;
  athleteData?: AthleteData;
  mileageRecommendation?: number; // Derived from coach's percentage and athlete's baseline
}


export interface TrainingChange {
  averageActivityMetric: number | null;
  trendDirection: "up" | "down" | "flat";
}

export interface WeeklySummary {
  athleteId: ID;
  weekStart: string; // YYYY-MM-DD string
  totalMileage: number;
  averageStress: TrainingChange;
  averageSleep: TrainingChange;
  averageRestingHeartRate: TrainingChange;
  averageExerciseHeartRate: TrainingChange;
  aiRecommendation: string; 
}

const PREFIX = 'TrainingRecords' + '.'

export default class TrainingRecordsConcept {
  private weeklyRecords: Collection<WeeklySummary>;
  private dailyRecords: Collection<DailyRecord>;

  constructor(private readonly db:Db) {
  // Initialize the two collections used by this concept
  this.weeklyRecords = this.db.collection(PREFIX + 'weeklyRecords');
  this.dailyRecords = this.db.collection(PREFIX + 'dailyRecords');
  }

  async createRecommendation(
    {Date, Users, percentage, note, creator}:
    {Date: string, Users: User[], percentage: number, note?: string, creator: User}
  ): Promise<DailyRecord | {error: string}> {

    if (creator.role !== 'coach') {
      return {error: `User ${creator.name} is not a coach and cannot create a training recommendation`}
    }

    // Iterate over the provided users using TypeScript's `for...of` syntax.
    // Use the `weeklyMileage` field from the `User` model (may be number or null).
    const recordsToInsert: DailyRecord[] = [];

    for (const user of Users) {
      const userMileage = user.weeklyMileage ?? 0;

      const rec: DailyRecord = {
        _id: freshID() as ID,
        date: Date,
        athleteId: user._id,
        coachRecommendations: { percentage, note: note ?? "" },
        athleteData: { mileage: userMileage },
        mileageRecommendation: Math.round((percentage / 100) * userMileage),
      };

      recordsToInsert.push(rec);
    }

    try {
      // Insert all created daily records (no-op if empty)
      if (recordsToInsert.length > 0) {
        await this.dailyRecords.insertMany(recordsToInsert);
      }
      // Return the first created record as an example success response
      return recordsToInsert[0] ?? { error: "No records created" };
    } catch (dbError) {
      console.error("Database error creating training recommendations:", dbError);
      return { error: "Failed to create training recommendation due to database error." };
    }
  }

  async logAthleteData({athlete, D})
  }
