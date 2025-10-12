---
timestamp: 'Sat Oct 11 2025 14:57:09 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251011_145709.7a366c56.md]]'
content_id: 09ccf909291ba845dade0e1220b2edba58e64ee837ce19ac276ef3e63de05254
---

# response:

Okay, this is a clear and well-defined concept for `UserDirectory`. Let's translate it into a TypeScript implementation.

We'll define the `Role` enum, the `User` interface, and then the `UserDirectory` class with the specified state and actions.

```typescript
// 1. Define the Role Enum
export enum Role {
    Coach = "coach",
    Athlete = "athlete",
}

// 2. Define the User Interface
// We'll use an interface to represent the structure of a User object.
// Note: For sensitive data like passwords, in a real application, you'd
// store a hashed version, not the plaintext password. For this concept,
// we'll follow your definition.
export interface User {
    name: string;
    email: string; // This will also act as the unique identifier
    role: Role;
    accountPassword: string; // In a real app, this would be a hashed password
    weeklyMileage: number | null; // Athletes have mileage, coaches do not
}

// 3. Implement the UserDirectory Class
export class UserDirectory {
    // State: A private Map to store users, keyed by their email for quick lookups.
    private users: Map<string, User>;

    constructor() {
        this.users = new Map<string, User>();
    }

    /**
     * Registers a new user with the system.
     * @param email The unique email of the user.
     * @param name The name of the user.
     * @param password The account password.
     * @param role The role of the user (Coach or Athlete).
     * @returns The newly created User object.
     * @throws Error if a user with the given email already exists.
     */
    public register(email: string, name: string, password: string, role: Role): User {
        // Requires: no user exists with that email
        if (this.users.has(email)) {
            throw new Error(`Registration failed: A user with email '${email}' already exists.`);
        }

        // Effects: creates a new User model
        const newUser: User = {
            name,
            email,
            role,
            accountPassword: password, // Store password (for concept; hash in real app)
            weeklyMileage: null, // Default to null; set specifically for athletes later
        };

        this.users.set(email, newUser);
        console.log(`User registered: ${name} (${email}) as a ${role}.`);
        return newUser;
    }

    /**
     * Sets the weekly mileage for an athlete.
     * @param email The email of the athlete.
     * @param weeklyMileage The weekly mileage number.
     * @throws Error if the user does not exist or is not an athlete.
     */
    public setWeeklyMileage(email: string, weeklyMileage: number): void {
        const user = this.users.get(email);

        // Requires: User exists with that email
        if (!user) {
            throw new Error(`Failed to set weekly mileage: User with email '${email}' not found.`);
        }

        // Requires: and has role = athlete
        if (user.role !== Role.Athlete) {
            throw new Error(`Failed to set weekly mileage: User '${email}' is not an athlete.`);
        }

        // Effects: user.weeklyMileage = weeklyMileage
        user.weeklyMileage = weeklyMileage;
        console.log(`Weekly mileage for ${user.name} (${email}) set to ${weeklyMileage}.`);
    }

    /**
     * Retrieves a user by their email.
     * @param email The email of the user to retrieve.
     * @returns The User object if found, otherwise undefined.
     */
    public getUserByEmail(email: string): User | undefined {
        return this.users.get(email);
    }

    /**
     * Retrieves all registered users.
     * @returns An array of all User objects.
     */
    public getAllUsers(): User[] {
        return Array.from(this.users.values());
    }
}

// --- Example Usage ---
if (require.main === module) {
    const userDirectory = new UserDirectory();

    console.log("--- Registering Users ---");
    const coach1 = userDirectory.register("coach@example.com", "Coach Smith", "secureCoachPass", Role.Coach);
    const athlete1 = userDirectory.register("athlete1@example.com", "Alice Runner", "secureAthletePass1", Role.Athlete);
    const athlete2 = userDirectory.register("athlete2@example.com", "Bob Sprinter", "secureAthletePass2", Role.Athlete);

    try {
        // Attempt to register with a duplicate email
        userDirectory.register("athlete1@example.com", "Alice Duplicate", "anotherPass", Role.Athlete);
    } catch (error: any) {
        console.error(error.message);
    }

    console.log("\n--- Setting Weekly Mileage ---");
    userDirectory.setWeeklyMileage("athlete1@example.com", 30);
    userDirectory.setWeeklyMileage("athlete2@example.com", 45);

    try {
        // Attempt to set mileage for a non-athlete
        userDirectory.setWeeklyMileage("coach@example.com", 20);
    } catch (error: any) {
        console.error(error.message);
    }

    try {
        // Attempt to set mileage for a non-existent user
        userDirectory.setWeeklyMileage("nonexistent@example.com", 10);
    } catch (error: any) {
        console.error(error.message);
    }

    console.log("\n--- Retrieving Users ---");
    const retrievedAthlete1 = userDirectory.getUserByEmail("athlete1@example.com");
    if (retrievedAthlete1) {
        console.log(`Retrieved Athlete 1:`, retrievedAthlete1);
    }

    const allUsers = userDirectory.getAllUsers();
    console.log("\nAll registered users:");
    allUsers.forEach(user => {
        console.log(`- ${user.name} (${user.email}), Role: ${user.role}, Mileage: ${user.weeklyMileage ?? 'N/A'}`);
    });

    // Demonstrate the principle: "After a user registers with a role, they can be referenced by other concepts."
    // For instance, another concept like 'TrainingPlan' could reference 'athlete1@example.com'
    // to assign them a plan, or 'coach@example.com' to show their assigned athletes.
    console.log("\nPrinciple demonstrated: Users can be referenced.");
    const currentCoach = userDirectory.getUserByEmail("coach@example.com");
    const currentAthlete = userDirectory.getUserByEmail("athlete1@example.com");

    if (currentCoach && currentAthlete) {
        console.log(`${currentCoach.name} (ID: ${currentCoach.email}) can now be associated with ${currentAthlete.name} (ID: ${currentAthlete.email}) in other parts of the system.`);
    }
}
```

### Explanation of the Implementation:

1. **`Role` Enum**:
   * This provides a type-safe way to define the possible roles (`Coach`, `Athlete`). Using `string` values for the enum allows for easier serialization/deserialization if you were saving this data.

2. **`User` Interface**:
   * This clearly defines the structure of a user object.
   * `email: string`: Marked as the unique identifier.
   * `weeklyMileage: number | null`: Correctly implements the concept that athletes have this value, while coaches (or newly registered users) might not (hence `null`).

3. **`UserDirectory` Class**:
   * **`private users: Map<string, User>`**: This is the core state. A `Map` is excellent here because:
     * It stores key-value pairs (`email` -> `User`).
     * It provides `O(1)` (average time) lookup, insertion, and deletion by email, which is very efficient for checking if a user exists (`users.has(email)`) or retrieving a user (`users.get(email)`).
   * **`constructor()`**: Initializes the `users` map.
   * **`register(email, name, password, role)`**:
     * **`requires` check**: It first checks `this.users.has(email)`. If true, it throws an `Error`, preventing duplicate emails. This is crucial for maintaining data integrity.
     * **`effects`**: A new `User` object is created. `weeklyMileage` is initialized to `null` as per the concept (it's only applicable to athletes *after* they are registered and their mileage is set). The new user is then added to the `users` map.
   * **`setWeeklyMileage(email, weeklyMileage)`**:
     * **`requires` checks**:
       * It first tries to `get` the user by email. If not found, it throws an error.
       * Then, it checks `user.role !== Role.Athlete`. If the user is not an athlete, it throws an error, enforcing the business rule.
     * **`effects`**: If all checks pass, it updates the `weeklyMileage` property of the `user` object retrieved from the map. Since objects in JavaScript are references, modifying the `user` object directly modifies the one stored in the `Map`.
   * **`getUserByEmail(email)`**: A convenient public method to fetch a user, returning `undefined` if not found.
   * **`getAllUsers()`**: Returns an array of all users, useful for displaying lists or for other operations that need to iterate through all users.

This implementation directly addresses your concept and provides a robust, type-safe, and efficient way to manage users as described.
