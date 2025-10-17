---
timestamp: 'Thu Oct 16 2025 13:04:21 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_130421.6ec8bfbf.md]]'
content_id: 032157d978b29d7af0aea26ad6b847164a7d095586d476cb85adc181d30aec6f
---

# response:

To test the `TrainingRecordsConcept` class, we'll create a mock MongoDB environment to simulate database interactions. This allows us to focus on the logic of `logData` and `createWeeklySummary` without needing an actual database.

First, let's address a minor but crucial inconsistency in the original `TrainingRecordsConcept.ts` file:
The `AthleteData` and `WeeklySummary` interfaces use `athlete: User`, meaning the `User` object is stored. However, the database queries in the methods use `athleteId: athlete` or `athleteId: athlete.id`. To ensure consistency and correct database querying for nested objects (which is common in MongoDB), the queries should explicitly target `"athlete.id"`.

**Proposed Corrections to `TrainingRecordsConcept.ts` (before testing):**

```typescript
// Inside logData method:
const existingEntry = await this.athleteData.findOne({
  "athlete.id": athlete.id, // Corrected from athleteId: athlete
  day: day,
});

// Inside createWeeklySummary method:
const currentWeekData: AthleteData[] = await this.athleteData.find({
  "athlete.id": athlete.id, // Corrected from athleteId: athlete
  day: { $gte: atMidnight(weekStart), $lte: atMidnight(weekEnd) }
}).sort({ day: 1 }).toArray();

const prevWeekData = await this.athleteData.find({
  "athlete.id": athlete.id, // Corrected from athleteId: athlete
  day: { $gte: atMidnight(prevWeekStart), $lte: atMidnight(prevWeekEnd) }
}).toArray();

// And the weeklyRecords.updateOne for upsert:
await this.weeklyRecords.updateOne(
    { "athlete.id": athlete.id, weekStart: weekStart }, // Corrected from athleteId: athlete
    { $set: weeklySummary },
    { upsert: true }
);
```

Now, let's write the tests using Deno's `assert` module and a custom mock for `mongodb`'s `Collection` and `Db` classes.

```typescript
// test/TrainingRecords_test.ts (or similar path)
import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Collection, Db } from "npm:mongodb";
import { ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts"; // Assuming this utility is available
import TrainingRecordsConcept, { AthleteData, WeeklySummary } from "../TrainingRecords.ts"; // Adjust path as needed

// Mock User object for testing. It aligns with the User interface definition from UserDirectoryConcept.
interface MockUser {
    id: ID;
    username: string;
    role: "athlete" | "coach";
    teamId: ID;
    // Add other properties if they are significant for comparisons/storage
}

const mockAthlete: MockUser = {
    id: freshID(),
    username: "testAthlete",
    role: "athlete",
    teamId: freshID(),
};

// --- Mock MongoDB Collection ---
// This mock simulates the behavior of a MongoDB Collection for testing purposes.
// It stores data in a simple array and implements methods like insertOne, findOne, updateOne, find.
class MockCollection<T> implements Collection<T> {
    public data: T[] = []; // In-memory storage for documents
    private name: string; // Name of the collection

    constructor(name: string) {
        this.name = name;
    }

    async insertOne(doc: T): Promise<any> {
        // Assign a mock _id for MongoDB compatibility if not present in the document
        const docWithId = { _id: freshID(), ...doc };
        this.data.push(docWithId);
        return { acknowledged: true, insertedId: (docWithId as any)._id };
    }

    async updateOne(filter: any, update: any, options?: any): Promise<any> {
        // Find the index of the document to update based on the filter
        const index = this.data.findIndex(item => {
            // Check for _id match if present in the filter
            if (filter._id && (item as any)._id === filter._id) return true;
            
            // Handle filters for 'athlete.id' combined with 'day' (for AthleteData)
            const filterAthleteId = filter["athlete.id"];
            const itemAthleteId = (item as any).athlete?.id; // Safely access nested athlete ID

            if (filterAthleteId && itemAthleteId && filter.day) {
                return itemAthleteId === filterAthleteId &&
                       (item as any).day.getTime() === filter.day.getTime();
            }
            // Handle filters for 'athlete.id' combined with 'weekStart' (for WeeklySummary)
            if (filterAthleteId && itemAthleteId && filter.weekStart) {
                return itemAthleteId === filterAthleteId &&
                       (item as any).weekStart.getTime() === filter.weekStart.getTime();
            }
            return false; // No match found
        });

        if (index === -1) { // Document not found
            if (options?.upsert) { // If upsert option is true, create a new document
                const newDoc: T = { _id: freshID() } as T; // Start with a new _id

                // Reconstruct the 'athlete' object if 'athlete.id' is in the filter
                if (filter["athlete.id"]) {
                    (newDoc as any).athlete = { ...mockAthlete, id: filter["athlete.id"] }; 
                }
                // Add other identifying fields from the filter
                if (filter.day) { (newDoc as any).day = filter.day; }
                if (filter.weekStart) { (newDoc as any).weekStart = filter.weekStart; }

                // Apply the $set operator to the new document
                for (const key in update.$set) {
                    if (key.includes('.')) { // Handle nested field updates (e.g., "athlete.username")
                        const [parentKey, childKey] = key.split('.');
                        (newDoc as any)[parentKey] = { ...((newDoc as any)[parentKey] || {}), [childKey]: update.$set[key] };
                    } else { // Handle top-level field updates
                        (newDoc as any)[key] = update.$set[key];
                    }
                }
                
                this.data.push(newDoc);
                return { acknowledged: true, upsertedId: (newDoc as any)._id, matchedCount: 0, modifiedCount: 0 };
            }
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0 }; // No upsert, no match, no modification
        }

        // Document found, update it
        const existingDoc = this.data[index];
        const updatedDoc = { ...existingDoc }; // Create a shallow copy to modify

        // Apply the $set operator to the existing document
        for (const key in update.$set) {
            if (key.includes('.')) { 
                const [parentKey, childKey] = key.split('.');
                (updatedDoc as any)[parentKey] = { ...((updatedDoc as any)[parentKey] || {}), [childKey]: update.$set[key] };
            } else {
                (updatedDoc as any)[key] = update.$set[key];
            }
        }
        this.data[index] = updatedDoc; // Replace the old document with the updated one
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    }

    async findOne(filter: any): Promise<T | null> {
        // Find and return the first document that matches the filter
        return this.data.find(item => {
            if (filter._id && (item as any)._id === filter._id) return true;

            const filterAthleteId = filter["athlete.id"];
            const itemAthleteId = (item as any).athlete?.id;

            if (filterAthleteId && itemAthleteId && filter.day) {
                return (itemAthleteId === filterAthleteId) &&
                       (item as any).day.getTime() === filter.day.getTime();
            }

            if (filterAthleteId && itemAthleteId && filter.weekStart) {
                return (itemAthleteId === filterAthleteId) &&
                       (item as any).weekStart.getTime() === filter.weekStart.getTime();
            }

            return false;
        }) || null;
    }

    find(filter: any): any {
        // Filter the data based on conditions
        const filteredData = this.data.filter(item => {
            let match = true;
            
            const filterAthleteId = filter["athlete.id"];
            const itemAthleteId = (item as any).athlete?.id;
            if (filterAthleteId && itemAthleteId) {
                if (itemAthleteId !== filterAthleteId) {
                    match = false;
                }
            } else if (filterAthleteId && !itemAthleteId) { // Filter specified, but item doesn't have it
                match = false;
            }

            // Handle date range for `day` using $gte and $lte
            if (match && filter.day) {
                const itemDay = (item as any).day;
                if (filter.day.$gte && itemDay.getTime() < filter.day.$gte.getTime()) {
                    match = false;
                }
                if (match && filter.day.$lte && itemDay.getTime() > filter.day.$lte.getTime()) {
                    match = false;
                }
            }
            return match;
        });

        // Return an object that mocks the chainable `sort` and `toArray` methods
        const findResult = {
            _data: filteredData, // Store filtered data internally
            sort: function(criteria: any) { 
                // Implement basic sorting for 'day' if criteria matches
                if (criteria.day === 1) {
                    this._data.sort((a: any, b: any) => a.day.getTime() - b.day.getTime());
                } else if (criteria.day === -1) {
                    this._data.sort((a: any, b: any) => b.day.getTime() - a.day.getTime());
                }
                return this; // Allow chaining
            }, 
            toArray: async function() { return this._data; } // Return sorted data as an array
        };
        return findResult;
    }

    // Unimplemented methods of Collection interface for simplicity in this test context
    aggregate(_pipeline: any, _options?: any): any { throw new Error("Method not implemented."); }
    bulkWrite(_operations: any, _options?: any): any { throw new Error("Method not implemented."); }
    countDocuments(_filter?: any, _options?: any): any { throw new Error("Method not implemented."); }
    deleteMany(_filter?: any, _options?: any): any { throw new Error("Method not implemented."); }
    deleteOne(_filter?: any, _options?: any): any { throw new Error("Method not implemented."); }
    distinct(_key: string, _filter?: any, _options?: any): any { throw new Error("Method not implemented."); }
    estimatedDocumentCount(_options?: any): any { throw new Error("Method not implemented."); }
    insertMany(_docs: any[], _options?: any): any { throw new Error("Method not implemented."); }
    replaceOne(_filter: any, _replacement: any, _options?: any): any { throw new Error("Method not implemented."); }
    updateMany(_filter: any, _update: any, _options?: any): any { throw new Error("Method not implemented."); }
    // ... many more methods not relevant for this test
}

// --- Mock MongoDB Db ---
// This mock simulates the behavior of a MongoDB Db object, returning mock collections.
class MockDb implements Db {
    private collections: Map<string, MockCollection<any>> = new Map();

    collection<T>(name: string): MockCollection<T> {
        if (!this.collections.has(name)) {
            this.collections.set(name, new MockCollection<T>(name));
        }
        return this.collections.get(name)!;
    }

    // Unimplemented methods of Db interface
    command(_command: any, _options?: any): any { throw new Error("Method not implemented."); }
    createCollection(_name: string, _options?: any): any { throw new Error("Method not implemented."); }
    createIndex(_collectionName: string, _keys: any, _options?: any): any { throw new Error("Method not implemented."); }
    dropCollection(_name: string, _options?: any): any { throw new Error("Method not implemented."); }
    dropDatabase(_options?: any): any { throw new Error("Method not implemented."); }
    indexInformation(_collectionName: string, _options?: any): any { throw new Error("Method not implemented."); }
    listCollections(_filter?: any, _options?: any): any { throw new Error("Method not implemented."); }
    listIndexes(_collectionName: string, _options?: any): any { throw new Error("Method not implemented."); }
    renameCollection(_from: string, _to: string, _options?: any): any { throw new Error("Method not implemented."); }
    runCommand(_command: any, _options?: any): any { throw new Error("Method not implemented."); }
    stats(_options?: any): any { throw new Error("Method not implemented."); }
    watch(_pipeline?: any, _options?: any): any { throw new Error("Method not implemented."); }
    aggregate(_pipeline?: any, _options?: any): any { throw new Error("Method not implemented."); }
    withSession<T>(_fn: (session: any) => Promise<T>, _options?: any): any { throw new Error("Method not implemented."); }
    get client(): any { throw new Error("Method not implemented."); }
    get databaseName(): string { return "mockdb"; }
    get namespace(): string { return "mockdb"; }
}

Deno.test("TrainingRecords Concept Tests", async (test) => {
    let mockDb: MockDb;
    let concept: TrainingRecordsConcept;
    let athleteDataCollection: MockCollection<AthleteData>;
    let weeklyRecordsCollection: MockCollection<WeeklySummary>;

    // Setup function to initialize mocks and clear data before each test block
    const setup = () => {
        mockDb = new MockDb();
        concept = new TrainingRecordsConcept(mockDb);
        athleteDataCollection = mockDb.collection<AthleteData>("TrainingRecords.athleteData");
        weeklyRecordsCollection = mockDb.collection<WeeklySummary>("TrainingRecords.weeklyRecords");
        // Clear data arrays to ensure a clean state for each test
        athleteDataCollection.data = [];
        weeklyRecordsCollection.data = [];
    };

    // Helper to add athlete data, simplifying test case creation
    const addAthleteData = async (
        athlete: MockUser,
        date: string,
        data: Partial<Omit<AthleteData, "athlete" | "day" | "id">>
    ) => {
        await concept.logData(new Date(date), athlete, data);
    };

    await test.step("logData", async (t) => {
        setup(); // Run setup for this 'logData' test block

        await t.step("should log new athlete data successfully", async () => {
            const today = new Date("2023-10-26T10:00:00Z"); // A Thursday
            const logValues = { mileage: 5, stress: 3, sleep: 7.5 };
            const result = await concept.logData(today, mockAthlete, logValues);

            assertExists((result as AthleteData).id);
            assertEquals((result as AthleteData).mileage, 5);
            assertEquals((result as AthleteData).athlete.id, mockAthlete.id);
            // Ensure day is normalized to midnight
            assertEquals((result as AthleteData).day.getTime(), new Date("2023-10-26T00:00:00.000Z").getTime());

            assertEquals(athleteDataCollection.data.length, 1);
            assertEquals(athleteDataCollection.data[0].mileage, 5);
        });

        await t.step("should update existing athlete data for the same day", async () => {
            const today = new Date("2023-10-27T10:00:00Z"); // A Friday
            await concept.logData(today, mockAthlete, { mileage: 10, stress: 5 });
            assertEquals(athleteDataCollection.data.length, 1); // First log adds one record
            assertEquals(athleteDataCollection.data[0].mileage, 10);

            // Log again for the same day, updating stress and adding sleep
            const updatedResult = await concept.logData(today, mockAthlete, { sleep: 8, stress: 4 });

            assertEquals(athleteDataCollection.data.length, 1); // Should still be 1 record, but updated
            assertEquals((updatedResult as AthleteData).mileage, 10); // Mileage should remain the same
            assertEquals((updatedResult as AthleteData).stress, 4); // Stress should be updated
            assertEquals((updatedResult as AthleteData).sleep, 8); // Sleep should be added/updated
        });

        await t.step("should return an error for invalid log keys", async () => {
            const today = new Date("2023-10-28T10:00:00Z");
            const invalidLogValues = { invalidKey: 10, mileage: 5 };
            // Cast to any to bypass TypeScript's compile-time check for invalid keys
            const result = await concept.logData(today, mockAthlete, invalidLogValues as any); 

            assertExists((result as { error: string }).error);
            assertEquals((result as { error: string }).error, "Invalid log key: invalidKey");
            assertEquals(athleteDataCollection.data.length, 0); // No data should be logged if key is invalid
        });
    });

    await test.step("createWeeklySummary", async (t) => {
        setup(); // Run setup for this 'createWeeklySummary' test block

        await t.step("should return an error if no athlete data is found for the current week", async () => {
            const todaysDate = new Date("2023-11-01T10:00:00Z"); // Wednesday in a week with no data
            const result = await concept.createWeeklySummary(mockAthlete, todaysDate);
            assertEquals((result as { error: string }).error, "No athlete data found for the current week.");
        });

        await t.step("should create a summary for the current week with no previous data", async () => {
            // Current week: Oct 29 (Sun) - Nov 4 (Sat)
            const todaysDate = new Date("2023-11-01T10:00:00Z"); // Wednesday
            await addAthleteData(mockAthlete, "2023-10-30T10:00:00Z", { mileage: 5, stress: 4, sleep: 7 });
            await addAthleteData(mockAthlete, "2023-11-01T10:00:00Z", { mileage: 7, stress: 5, sleep: 8 });
            await addAthleteData(mockAthlete, "2023-11-03T10:00:00Z", { mileage: 3, stress: 3, sleep: 6 });

            const result = await concept.createWeeklySummary(mockAthlete, todaysDate) as WeeklySummary;

            assertExists(result);
            assertEquals(result.athlete.id, mockAthlete.id);
            // Verify weekStart is the correct Sunday at midnight
            assertEquals(result.weekStart.getTime(), new Date("2023-10-29T00:00:00.000Z").getTime());
            assertEquals(result.mileageSoFar, 5 + 7 + 3); // Total 15
            assertEquals(result.averageStress.averageActivityMetric, (4 + 5 + 3) / 3); // Average stress: 4
            assertEquals(result.averageStress.trendDirection, "up"); // No previous data, so trend defaults to "up"
            assertEquals(result.averageSleep.averageActivityMetric, (7 + 8 + 6) / 3); // Average sleep: 7
            assertEquals(result.averageSleep.trendDirection, "up");
            assertEquals(result.athleteDataDailyCollectionForWeek.length, 3);
            // Check that daily data is present and sorted by day
            assertObjectMatch(result.athleteDataDailyCollectionForWeek[0], {mileage: 5}); 
            assertObjectMatch(result.athleteDataDailyCollectionForWeek[1], {mileage: 7});
            assertObjectMatch(result.athleteDataDailyCollectionForWeek[2], {mileage: 3});
        });

        await t.step("should correctly calculate 'up' trends", async () => {
            // Log data for the previous week: Oct 22 (Sun) - Oct 28 (Sat)
            await addAthleteData(mockAthlete, "2023-10-23T10:00:00Z", { mileage: 3, stress: 2, sleep: 6, restingHeartRate: 50 });
            await addAthleteData(mockAthlete, "2023-10-25T10:00:00Z", { mileage: 4, stress: 3, sleep: 7, restingHeartRate: 52 });
            // Previous averages: stress=2.5, sleep=6.5, restingHeartRate=51

            // Log data for the current week: Oct 29 (Sun) - Nov 4 (Sat)
            const todaysDate = new Date("2023-11-01T10:00:00Z"); // Wednesday
            await addAthleteData(mockAthlete, "2023-10-30T10:00:00Z", { mileage: 5, stress: 4, sleep: 7.5, restingHeartRate: 55 });
            await addAthleteData(mockAthlete, "2023-11-02T10:00:00Z", { mileage: 6, stress: 5, sleep: 8, restingHeartRate: 56 });
            // Current averages: stress=4.5, sleep=7.75, restingHeartRate=55.5 (all are higher than previous)

            const result = await concept.createWeeklySummary(mockAthlete, todaysDate) as WeeklySummary;

            assertEquals(result.averageStress.trendDirection, "up");
            assertEquals(result.averageSleep.trendDirection, "up");
            assertEquals(result.averageRestingHeartRate.trendDirection, "up");
            assertEquals(result.mileageSoFar, 11); // Current week mileage
        });

        await t.step("should correctly calculate 'down' trends", async () => {
            // Log data for the previous week (higher values)
            await addAthleteData(mockAthlete, "2023-10-23T10:00:00Z", { mileage: 7, stress: 5, sleep: 8, restingHeartRate: 60 });
            await addAthleteData(mockAthlete, "2023-10-25T10:00:00Z", { mileage: 8, stress: 6, sleep: 9, restingHeartRate: 62 });
            // Previous averages: stress=5.5, sleep=8.5, restingHeartRate=61

            // Log data for the current week (lower values)
            const todaysDate = new Date("2023-11-01T10:00:00Z"); // Wednesday
            await addAthleteData(mockAthlete, "2023-10-30T10:00:00Z", { mileage: 3, stress: 3, sleep: 6.5, restingHeartRate: 50 });
            await addAthleteData(mockAthlete, "2023-11-02T10:00:00Z", { mileage: 2, stress: 2, sleep: 6, restingHeartRate: 51 });
            // Current averages: stress=2.5, sleep=6.25, restingHeartRate=50.5 (all are lower)

            const result = await concept.createWeeklySummary(mockAthlete, todaysDate) as WeeklySummary;

            assertEquals(result.averageStress.trendDirection, "down");
            assertEquals(result.averageSleep.trendDirection, "down");
            assertEquals(result.averageRestingHeartRate.trendDirection, "down");
            assertEquals(result.mileageSoFar, 5);
        });

        await t.step("should correctly calculate 'flat' trends (within tolerance)", async () => {
            // Log data for previous week
            await addAthleteData(mockAthlete, "2023-10-23T10:00:00Z", { stress: 4.0, sleep: 7.0 });
            await addAthleteData(mockAthlete, "2023-10-25T10:00:00Z", { stress: 4.1, sleep: 7.1 });
            // Prev avg stress = 4.05, Prev avg sleep = 7.05

            // Log data for current week (values very close to previous)
            const todaysDate = new Date("2023-11-01T10:00:00Z"); // Wednesday
            await addAthleteData(mockAthlete, "2023-10-30T10:00:00Z", { stress: 4.05, sleep: 7.0 });
            await addAthleteData(mockAthlete, "2023-11-02T10:00:00Z", { stress: 4.06, sleep: 7.11 });
            // Curr avg stress = 4.055, Curr avg sleep = 7.055
            // The difference (0.005) is within the default tolerance (0.01 in the concept's helper `compareAverages`)

            const result = await concept.createWeeklySummary(mockAthlete, todaysDate) as WeeklySummary;

            assertEquals(result.averageStress.trendDirection, "flat");
            assertEquals(result.averageSleep.trendDirection, "flat");
        });

        await t.step("should handle null averages gracefully in compareAverages", async () => {
            // Current week: only some data logged, previous week has no data for comparison
            const todaysDate = new Date("2023-11-01T10:00:00Z"); // Wednesday
            await addAthleteData(mockAthlete, "2023-10-30T10:00:00Z", { stress: 5 }); // Only stress logged
            await addAthleteData(mockAthlete, "2023-11-01T10:00:00Z", { sleep: 7 }); // Only sleep logged

            const result = await concept.createWeeklySummary(mockAthlete, todaysDate) as WeeklySummary;

            // Stress: prev=null, curr=5 -> "up"
            assertEquals(result.averageStress.averageActivityMetric, 5);
            assertEquals(result.averageStress.trendDirection, "up");

            // Sleep: prev=null, curr=7 -> "up"
            assertEquals(result.averageSleep.averageActivityMetric, 7);
            assertEquals(result.averageSleep.trendDirection, "up");

            // Resting Heart Rate: prev=null, curr=null -> "flat"
            assertEquals(result.averageRestingHeartRate.averageActivityMetric, null);
            assertEquals(result.averageRestingHeartRate.trendDirection, "flat");

            // Test scenario: previous week has data, current week has no data
            setup(); // Reset collections
            // Log previous week data
            await addAthleteData(mockAthlete, "2023-10-23T10:00:00Z", { stress: 5, sleep: 7 });
            // `todaysDate` for the *next* week, so current week will have no data.
            const nextWeekDate = new Date("2023-11-08T10:00:00Z"); 
            const result2 = await concept.createWeeklySummary(mockAthlete, nextWeekDate) as WeeklySummary;

            // Stress: prev=5, curr=null -> "down"
            assertEquals(result2.averageStress.averageActivityMetric, null);
            assertEquals(result2.averageStress.trendDirection, "down");
            
            // Sleep: prev=7, curr=null -> "down"
            assertEquals(result2.averageSleep.averageActivityMetric, null);
            assertEquals(result2.averageSleep.trendDirection, "down");
        });

        await t.step("should correctly store and retrieve weekly summary (upsert behavior)", async () => {
            // First run: create the summary for a week
            const todaysDate1 = new Date("2023-11-01T10:00:00Z");
            await addAthleteData(mockAthlete, "2023-10-30T10:00:00Z", { mileage: 10, stress: 5 });
            await concept.createWeeklySummary(mockAthlete, todaysDate1);

            assertEquals(weeklyRecordsCollection.data.length, 1);
            assertEquals(weeklyRecordsCollection.data[0].mileageSoFar, 10);
            assertEquals(weeklyRecordsCollection.data[0].averageStress.averageActivityMetric, 5);

            // Second run for the *same* week, with updated daily data, should trigger an update (upsert)
            await addAthleteData(mockAthlete, "2023-11-01T10:00:00Z", { mileage: 5, stress: 3 }); // Add more data
            const updatedSummary = await concept.createWeeklySummary(mockAthlete, todaysDate1) as WeeklySummary;

            assertEquals(weeklyRecordsCollection.data.length, 1); // Still only one record in the collection
            assertEquals(updatedSummary.mileageSoFar, 15); // Mileage should be updated (10 + 5)
            assertEquals(updatedSummary.averageStress.averageActivityMetric, (5 + 3) / 2); // Average stress updated
            // Verify the stored record in the mock collection is also updated
            assertEquals(weeklyRecordsCollection.data[0].mileageSoFar, 15);
            assertEquals(weeklyRecordsCollection.data[0].averageStress.averageActivityMetric, (5 + 3) / 2);
        });

        await t.step("should populate athleteDataDailyCollectionForWeek with sorted data", async () => {
            const todaysDate = new Date("2023-11-01T10:00:00Z"); // Wednesday
            // Log data out of chronological order to test sorting
            await addAthleteData(mockAthlete, "2023-11-01T10:00:00Z", { mileage: 7 }); // Wednesday
            await addAthleteData(mockAthlete, "2023-10-30T10:00:00Z", { mileage: 5 }); // Monday
            await addAthleteData(mockAthlete, "2023-11-03T10:00:00Z", { mileage: 3 }); // Friday

            const result = await concept.createWeeklySummary(mockAthlete, todaysDate) as WeeklySummary;

            assertEquals(result.athleteDataDailyCollectionForWeek.length, 3);
            // Assert that the data is sorted by day
            assertEquals(result.athleteDataDailyCollectionForWeek[0].day.getTime(), new Date("2023-10-30T00:00:00.000Z").getTime());
            assertEquals(result.athleteDataDailyCollectionForWeek[0].mileage, 5);
            assertEquals(result.athleteDataDailyCollectionForWeek[1].day.getTime(), new Date("2023-11-01T00:00:00.000Z").getTime());
            assertEquals(result.athleteDataDailyCollectionForWeek[1].mileage, 7);
            assertEquals(result.athleteDataDailyCollectionForWeek[2].day.getTime(), new Date("2023-11-03T00:00:00.000Z").getTime());
            assertEquals(result.athleteDataDailyCollectionForWeek[2].mileage, 3);
        });
    });
});

```
