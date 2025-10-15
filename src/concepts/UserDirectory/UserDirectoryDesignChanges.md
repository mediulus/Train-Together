
## UserDirectory — Design Change Summary

During implementation I decided to adopt Google sign-in as the primary authentication flow for the web front end. That decision influenced several state fields and actions in the `UserDirectory` concept. The goal is to: 1) support login via Google ID tokens, 2) record a user's primary authentication method and last login time, and 3) separate identity-related updates so they can be changed independently.

### Rationale

- Google sign-in simplifies onboarding and reduces the need for a separate registration flow.
- Storing a stable `userId` avoids relying on mutable fields like `name` for lookups and relationships.
- Separate setters for identity attributes (name, role, gender) make it easier to update or revert individual attributes.

### State changes

The following fields are added or clarified in the concept state:

- `google` — marker indicating the user has a Google-based identity (keeps Google-specific metadata if needed).
- `primaryAuth` — the user's primary authentication provider (e.g., `google`).
- `lastLoginAt` — timestamp of the user's most recent login.

Notes:
- Use `userId` as the canonical identifier for users throughout the system instead of `name`.

### New / updated actions

Authentication and user creation:

- `loginWithGoogleIdToken(idToken)` — primary login action for front end to authenticate a user using a Google ID token. Replaces the older generic `register` action from Assignment 2. Responsibilities:
	- Validate the ID token and extract identity claims.
	- Create a user record if one does not exist (using a stable `userId`).
	- Set `primaryAuth` to `google` and update `lastLoginAt`.

Identity management (post-login):

- `setName(userId, name)` — set or update the user's display name.
- `setRole(userId, role)` — set or update the user's role (e.g., athlete, coach).
- `setGender(userId, gender)` — set or update the user's gender.

Query helpers added to support coach workflows:

- `getWeeklyMileage(userId)` — (planned) returns mileage for the current week; intended to integrate with `TrainingRecords`.
- `getAthletesByGender(gender)` — returns users filtered by gender to support coach queries and reports.
- `getUserRole(userId)` - returns users role athlete or coach for role verification in other concepts

### Design notes & assumptions
- Identity updates operate on `userId` to ensure stability across changes to display names or other mutable fields.
- I intentionally kept identity setters separate rather than combining them into a single `setIdentificationCriteria` action. This enables independent updates and simpler UI flows for incremental prompts.
- `getWeeklyMileage` is a planned integration point and may be implemented as a query that aggregates data from the `TrainingRecords` concept.
