OPERATIONAL PRINCIPLE — google onboarding & profile setup ...
------- output -------

🪵 ACTION loginWithGoogle:
{
  "sub": "OP_SUB_1",
  "email": "runner@example.com",
  "emailVerified": true
}

🪵 RESULT loginWithGoogle:
{
  "userId": "0199e045-7c01-7b72-b967-404f205f1a57",
  "needsName": true,
  "needsRole": true
}

🪵 ACTION setName:
{
  "userId": "0199e045-7c01-7b72-b967-404f205f1a57",
  "name": "Taylor Runner"
}

🪵 ACTION setRole:
{
  "userId": "0199e045-7c01-7b72-b967-404f205f1a57",
  "role": "athlete"
}

🪵 ACTION setGender:
{
  "userId": "0199e045-7c01-7b72-b967-404f205f1a57",
  "gender": "female"
}

🪵 ACTION setWeeklyMileage:
{
  "userId": "0199e045-7c01-7b72-b967-404f205f1a57",
  "weeklyMileage": 45
}

🪵 ACTION getAthleteMileage:
{
  "userId": "0199e045-7c01-7b72-b967-404f205f1a57"
}

🪵 RESULT getAthleteMileage:
{
  "weeklyMileage": 45
}

🪵 ACTION getAthletesByGender(Female):
{}

🪵 RESULT getAthletesByGender(Female):
{
  "athletes": [
    {
      "_id": "0199e045-7c01-7b72-b967-404f205f1a57",
      "email": "runner@example.com",
      "name": "Taylor Runner",
      "role": "athlete",
      "weeklyMileage": 45,
      "gender": "female",
      "google": {
        "sub": "OP_SUB_1",
        "email": "runner@example.com",
        "emailVerified": true
      },
      "primaryAuth": "google",
      "lastLoginAt": "2025-10-14T01:11:14.177Z"
    }
  ]
}

🪵 ACTION loginWithGoogle (again):
{
  "sub": "OP_SUB_1",
  "email": "runner@example.com",
  "emailVerified": true
}

🪵 RESULT loginWithGoogle (again):
{
  "userId": "0199e045-7c01-7b72-b967-404f205f1a57",
  "needsName": false,
  "needsRole": false
}
----- output end -----
OPERATIONAL PRINCIPLE — google onboarding & profile setup ... ok (1ms)
idToken — oauth NOT configured → error ...
------- output -------

🪵 ACTION loginWithGoogleIdToken (unconfigured):
{
  "idToken": "anything"
}

🪵 RESULT:
{
  "error": "Google verification is not configured (oauth clientId missing)."
}
----- output end -----
idToken — oauth NOT configured → error ... ok (0ms)
idToken — mocked oauth + valid payload → creates/returns user ...
------- output -------

🪵 ACTION loginWithGoogleIdToken (valid):
{
  "idToken": "valid.token"
}

🪵 RESULT:
{
  "userId": "0199e045-7c02-7dcc-824f-fdc4e26c93a7",
  "needsName": false,
  "needsRole": true
}
----- output end -----
idToken — mocked oauth + valid payload → creates/returns user ... ok (0ms)
idToken — mocked oauth + email_verified:false → error ...
------- output -------

🪵 ACTION loginWithGoogleIdToken (unverified):
{
  "idToken": "valid.token"
}

🪵 RESULT:
{
  "error": "Google email must be verified."
}
----- output end -----
idToken — mocked oauth + email_verified:false → error ... ok (0ms)
setName — happy path updates user.name (NOT userName) ...
------- output -------

🪵 ACTION setName:
{
  "userId": "0199e045-7c02-7fe3-8638-615c0b76cfdd",
  "name": "Alex Doe"
}

🪵 RESULT setName:
{}
----- output end -----
setName — happy path updates user.name (NOT userName) ... ok (0ms)
setName — user not found ... ok (0ms)
setGender — overwrite Male after Female ... ok (0ms)
setGender — user not found ... ok (0ms)
setWeeklyMileage — athlete happy path + overwrite ... ok (0ms)
setWeeklyMileage — coach should fail ... ok (0ms)
setWeeklyMileage — user not found ... ok (0ms)
getAthleteMileage — happy path returns set mileage ... ok (0ms)
getAthleteMileage — athlete with no mileage returns null ... ok (0ms)
getAthleteMileage — coach should error ... ok (0ms)
getAthleteMileage — user not found ... ok (0ms)
getAthletesByGender — filters only athletes of requested gender ... ok (0ms)
getAthletesByGender — empty list when no matches ... ok (0ms)
getAthletesByGender — excludes coaches even if gender matches ... ok (0ms)
getAthletesByGender — DB failure surfaces as error ...
------- output -------
Database error during fetching athletes by gender: Error: boom
    at InMemoryCollection.concept.users.find (file:///Users/megandiulus/Desktop/6.104/Assignment 4/Train-Together/src/concepts/UserDirectory/UserDirectoryConcept.test.ts:514:47)
    at UserDirectoryConcept.getAthletesByGender (file:///Users/megandiulus/Desktop/6.104/Assignment 4/Train-Together/src/concepts/UserDirectory/UserDirectoryConcept.ts:347:41)
    at file:///Users/megandiulus/Desktop/6.104/Assignment 4/Train-Together/src/concepts/UserDirectory/UserDirectoryConcept.test.ts:516:29
    at innerWrapped (ext:cli/40_test.js:181:11)
    at exitSanitizer (ext:cli/40_test.js:97:33)
    at outerWrapped (ext:cli/40_test.js:124:20)
----- output end -----
getAthletesByGender — DB failure surfaces as error ... ok (0ms)

ok | 19 passed | 0 failed (6ms)