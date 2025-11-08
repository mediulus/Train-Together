# Synchronization Writing Formula

## The 4-Part Formula

### 1. **WHEN Clause** - Pattern Matching on Actions

```typescript
when: actions([
  [ConceptName.actionName, { input: pattern }, { output: pattern }],
]);
```

**Key Rules:**

- **Action pattern**: `[Concept.action, inputPattern, outputPattern]`
- **Input pattern**: Match on parameters you care about, use `{}` for "any"
- **Output pattern**: Match on return values to bind them to variables
- **Multiple actions**: Matches on causal flow (actions that led to each other)
- **For requests**: Always match on specific `path` to avoid conflicts

**Common Mistake:** ❌ Don't specify output patterns in the `then` clause!

---

### 2. **WHERE Clause** - Authorization & Data Enrichment

```typescript
where: async (frames) => {
  const originalFrame = frames[0];

  // Call concept methods directly (NOT as actions)
  const result = await ConceptName.someMethod({ param: originalFrame[variable] });

  // Filter based on business logic
  if (/* authorization fails */) {
    return new Frames(); // Empty = sync won't fire then clause
  }

  // Return enriched frame
  return new Frames({
    ...originalFrame,  // Keep existing bindings
    [newVariable]: result  // Add new bindings
  });
}
```

**Key Rules:**

- **MUST** be `async` if calling concept methods
- **MUST** return `Frames` object (never plain arrays)
- Call concept methods **directly**, not through the sync engine
- Use `frames.query()` ONLY for query methods (with `_` prefix) that return arrays
- Empty `Frames()` = skip the `then` clause (useful for authorization failures)
- Spread `...originalFrame` to preserve existing variable bindings

**Common Mistakes:**

- ❌ Trying to call concept actions (remove from `then`, call directly)
- ❌ Matching on output patterns that don't exist (e.g., `{ coach }` when method returns full user object)
- ❌ Returning `[]` instead of `new Frames()`

---

### 3. **THEN Clause** - Fire Actions

```typescript
then: actions([[ConceptName.actionName, { input: pattern }]]);
```

**Key Rules:**

- **Only 2 elements**: `[Concept.action, inputPattern]`
- **NO output pattern** in then clause!
- Use variables that were bound in `when` or `where`
- Multiple actions can be fired sequentially

**Common Mistake:** ❌ Including output pattern like `[Action, {input}, {output}]`

---

### 4. **Variables** - Destructure All Symbols

```typescript
export const MySyncName: Sync = ({ request, userId, role, user, data }) => ({
  when: ...
})
```

**Key Rules:**

- Destructure ALL variables you'll use in any clause
- Variables are **symbols** - use `frame[variable]`, not `frame.variable`
- Variables flow through frames automatically via causal relationships
- Bind new variables in `where` clause by adding to frame object

---

## Complete Example Pattern

```typescript
export const MyRequest: Sync = ({ request, inputVar, outputVar, enrichedVar }) => ({
  // 1. Match on initial request
  when: actions([
    Requesting.request,
    { path: "/My/path", inputVar },
    { request },
  ]),

  // 2. Authorize & enrich data
  where: async (frames) => {
    const originalFrame = frames[0];

    // Call concept methods directly
    const result = await MyConcept.checkSomething({
      param: originalFrame[inputVar]
    });

    // Authorization logic
    if (/* not authorized */) {
      return new Frames(); // Skip then clause
    }

    // Enrich frame
    return new Frames({
      ...originalFrame,
      [enrichedVar]: result,
    });
  },

  // 3. Fire the actual business logic
  then: actions([
    MyConcept.doSomething,
    { input: inputVar, data: enrichedVar }
  ]),
});

// 4. Respond when action completes
export const MyResponse: Sync = ({ request, result }) => ({
  when: actions(
    [Requesting.request, { path: "/My/path" }, { request }],
    [MyConcept.doSomething, {}, { result }]
  ),
  then: actions([
    Requesting.respond,
    { request, result }
  ]),
});
```

---

## Common Patterns

### Request/Response Pattern

```typescript
// Step 1: Request triggers business logic
export const MyRequest: Sync = ({ request, param }) => ({
  when: actions([Requesting.request, { path: "/path", param }, { request }]),
  then: actions([MyConcept.action, { param }]),
});

// Step 2: Success response
export const MyResponseSuccess: Sync = ({ request, result }) => ({
  when: actions(
    [Requesting.request, { path: "/path" }, { request }],
    [MyConcept.action, {}, { result }]
  ),
  then: actions([Requesting.respond, { request, result }]),
});

// Step 3: Error response
export const MyResponseError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/path" }, { request }],
    [MyConcept.action, {}, { error }]
  ),
  then: actions([Requesting.respond, { request, error }]),
});
```

### Authorization Pattern

```typescript
export const AuthorizedRequest: Sync = ({ request, userId, user, role }) => ({
  when: actions([Requesting.request, { path: "/path", userId }, { request }]),
  where: async (frames) => {
    const originalFrame = frames[0];
    const userIdValue = originalFrame[userId];

    // Check authorization
    const roleResult = await UserDirectory.getUserRole({ userId: userIdValue });
    const userResult = await UserDirectory.getUser({ userId: userIdValue });

    // Handle errors
    if (roleResult?.error || userResult?.error) {
      return new Frames(); // Authorization failed
    }

    // Check role
    if (roleResult !== "admin") {
      return new Frames(); // Not authorized
    }

    // Authorized - enrich frame
    return new Frames({
      ...originalFrame,
      [user]: userResult,
      [role]: roleResult,
    });
  },
  then: actions([MyConcept.adminAction, { user }]),
});
```

---

## Debugging Checklist

When a sync doesn't fire:

1. **Check action patterns match concept signatures**

   - Input parameter names must match exactly
   - Output pattern keys must match what the action actually returns

2. **Check where clause returns Frames**

   - Not `[]`, but `new Frames()` or `new Frames({...})`
   - Make sure it's `async` if calling concept methods

3. **Check you're not using output patterns in then clause**

   - Pattern: `[Action, { input }]` ✅
   - Not: `[Action, { input }, { output }]` ❌

4. **Check variables are destructured in function params**

   - All symbols used in when/where/then must be in `({ ... })`

5. **Check concept methods vs. actions**
   - Methods that don't change state should be called directly in `where`
   - Actions that change state should be in `then`

---

## Key Lessons from This Bug

1. **Don't try to match on action outputs that don't match the actual return type**

   - `getUser` returns a full user object, not `{ coach: ... }`
   - Match on `{}` in output if you don't care, or use the actual structure

2. **Concept methods can be called directly in where clause**

   - You don't need separate syncs to orchestrate lookups
   - Combine authorization and business logic in one sync

3. **Output patterns only in when clause, never in then**

   - When: `[Action, {input}, {output}]` to bind output variables
   - Then: `[Action, {input}]` to trigger action with inputs

4. **Empty frames stop the sync chain**

   - `return new Frames()` = don't fire then clause
   - Useful for authorization failures or early exits

5. **Handle authorization failures with immediate error responses**

   - When authorization fails in the `where` clause, call `Requesting.respond` directly with an error
   - This prevents request timeouts and provides clear feedback to users
   - Example: `await Requesting.respond({ request: requestValue, error: "Only coaches can create events." })`

6. **Optional parameters in then clause**
   - Only include parameters in the `then` action pattern that are guaranteed to be bound
   - Optional fields should either be omitted or handled conditionally in the `where` clause
   - The concept method should handle missing optional parameters gracefully
