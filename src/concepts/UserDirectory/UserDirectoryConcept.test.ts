

import UserDirectoryConcept, {
  type User,
  type UserID,
  type GoogleProfile,
  Gender,
  Role,
} from "./UserDirectoryConcept.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------- Pretty logs + tiny result helpers ----------
function logStep(label: string, data: unknown) {
  console.log(`\n🪵 ${label}:\n${JSON.stringify(data, null, 2)}`);
}
function expectOk<T>(res: T, ctx = ""): T {
  const r = res as any;
  if (r && typeof r === "object" && "error" in r && r.error) {
    throw new Error(`Expected ok${ctx ? ` (${ctx})` : ""}, got error: ${r.error}`);
  }
  return res;
}
function expectErr<T>(res: T, includes?: string, ctx = ""): T {
  const r = res as any;
  if (!(r && typeof r === "object" && "error" in r && r.error)) {
    throw new Error(`Expected error${ctx ? ` (${ctx})` : ""}, got: ${JSON.stringify(res)}`);
  }
  if (includes && !String(r.error).includes(includes)) {
    throw new Error(`Expected error to include "${includes}"${ctx ? ` (${ctx})` : ""}, got: ${r.error}`);
  }
  return res;
}
function normalizeEmail(e: string) {
  return e.normalize("NFC").trim().toLowerCase();
}

// ---------- Minimal in-memory Mongo mocks (only what's needed here) ----------
type DocWithId = { _id: unknown };

class InMemoryCollection<T extends DocWithId> {
  name: string;
  private docs: T[] = [];
  private uniqueEmail = false;
  private uniqueGoogleSub = false;

  constructor(name: string) {
    this.name = name;
  }

  find(filter: Record<string, unknown>) {
    const out = this.docs.filter((d) => this.matches(d as any, filter));
    return {
      toArray: () => structuredClone(out) as T[],
    };
  }

  createIndex(keys: Record<string, 1 | -1>, opts?: Record<string, unknown>) {
    const key = Object.keys(keys)[0];
    if (key === "email") this.uniqueEmail = Boolean(opts && (opts as any).unique);
    if (key === "google.sub") this.uniqueGoogleSub = Boolean(opts && (opts as any).unique);
    return `${this.name}_${key}_idx`;
  }

  findOne(filter: Record<string, unknown>): T | null {
    const matches = this.docs.filter((d) => this.matches(d, filter));
    return matches[0] ?? null;
  }

  insertOne(doc: T) {
    const rec = doc as any;
    if (this.uniqueEmail && rec.email) {
      const conflict = this.docs.find((d) => (d as any).email === rec.email);
      if (conflict) throw new Error("duplicate key error on email");
    }
    if (this.uniqueGoogleSub && rec.google?.sub) {
      const sub = rec.google.sub;
      const conflict = this.docs.find((d) => (d as any).google?.sub === sub);
      if (conflict) throw new Error("duplicate key error on google.sub");
    }
    this.docs.push(structuredClone(doc));
    return { acknowledged: true, insertedId: doc._id };
  }

  async updateOne(filter: Record<string, unknown>, update: { $set?: Partial<T> }) {
    const target = await this.findOne(filter);
    if (!target) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };

    const idx = this.docs.findIndex((d) => d._id === target._id);
    const current = this.docs[idx];
    const next: T = { ...(structuredClone(current)), ...(update.$set ?? {}) } as T;

    const setRec = update.$set as any;
    if (this.uniqueEmail && setRec?.email) {
      const newEmail = setRec.email;
      const conflict = this.docs.find((d) => (d as any).email === newEmail && d._id !== current._id);
      if (conflict) throw new Error("duplicate key error on email");
    }
    if (this.uniqueGoogleSub && setRec?.google?.sub) {
      const newSub = setRec.google.sub;
      const conflict = this.docs.find((d) => (d as any).google?.sub === newSub && d._id !== current._id);
      if (conflict) throw new Error("duplicate key error on google.sub");
    }

    this.docs[idx] = next;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  getAll(): T[] {
    return structuredClone(this.docs);
  }

  private matches(doc: T, filter: Record<string, unknown>) {
    for (const [k, v] of Object.entries(filter)) {
      if (k.includes(".")) {
        const [a, b] = k.split(".");
        const container = (doc as any)[a] as Record<string, unknown> | undefined;
        if ((container ?? {})[b!] !== v) return false;
      } else {
        if ((doc as any)[k] !== v) return false;
      }
    }
    return true;
  }
}

class InMemoryDb {
  private colls = new Map<string, InMemoryCollection<DocWithId>>();
  collection<T extends DocWithId>(name: string): InMemoryCollection<T> {
    if (!this.colls.has(name)) this.colls.set(name, new InMemoryCollection<DocWithId>(name));
    return this.colls.get(name)! as unknown as InMemoryCollection<T>;
  }
}

function newConcept(
  opts?: ConstructorParameters<typeof UserDirectoryConcept>[1],
) {
  const db = new InMemoryDb();
  const concept = new (UserDirectoryConcept as any)(db as unknown as any, opts) as UserDirectoryConcept;
  return { concept, db };
}

function readUserById(db: InMemoryDb, id: UserID): User | null {
  const coll = db.collection<User>("UserDirectory.users");
  return coll.getAll().find((u) => u._id === id) ?? null;
}

// ---------- Mock OAuth2 client for id-token verification ----------
class MockTicket {
  constructor(private payload: Record<string, unknown> | null) {}
  getPayload() {
    return this.payload as any;
  }
}
class MockOAuth2Client {
  payload: Record<string, unknown> | null = null;
  verifyIdToken({ idToken, audience }: { idToken: string; audience: string }) {
    if (!idToken || !audience) throw new Error("bad token or audience");
    return new MockTicket(this.payload);
  }
}

// ============================================================================
// OPERATIONAL PRINCIPLE — End-to-end happy path
// Sequence:
//   1) loginWithGoogle → new user (needsName=true, needsRole=true)
//   2) setName → name set
//   3) setRole(Athlete) → role set
//   4) setGender(Female) → gender set
//   5) setWeeklyMileage(45) → mileage set
//   6) getAthleteMileage → 45
//   7) getAthletesByGender(Female) → contains this user
//   8) loginWithGoogle again → same user, needsName=false, needsRole=false
// ============================================================================
Deno.test("OPERATIONAL PRINCIPLE — google onboarding & profile setup", async () => {
  const { concept, db } = newConcept();

  // 1) loginWithGoogle
  const profile: GoogleProfile = {
    sub: "OP_SUB_1",
    email: "runner@example.com",
    emailVerified: true,
  };
  logStep("ACTION loginWithGoogle", profile);
  const login = await concept.loginWithGoogle(profile);
  logStep("RESULT loginWithGoogle", login);
  expectOk(login);
  if ("error" in login) return;

  assertEquals(login.needsName, true);
  assertEquals(login.needsRole, true);

  // 2) setName
  logStep("ACTION setName", { userId: login.userId, name: "Taylor Runner" });
  expectOk(await concept.setName(login.userId, "Taylor Runner"));

  // 3) setRole (Athlete)
  logStep("ACTION setRole", { userId: login.userId, role: Role.Athlete });
  expectOk(await concept.setRole(login.userId, Role.Athlete));

  // 4) setGender (Female)
  logStep("ACTION setGender", { userId: login.userId, gender: Gender.Female });
  expectOk(await concept.setGender(login.userId, Gender.Female));

  // 5) setWeeklyMileage (45)
  logStep("ACTION setWeeklyMileage", { userId: login.userId, weeklyMileage: 45 });
  expectOk(await concept.setWeeklyMileage(login.userId, 45));

  // 6) getAthleteMileage → 45
  logStep("ACTION getAthleteMileage", { userId: login.userId });
  const mileage = await concept.getAthleteMileage(login.userId);
  logStep("RESULT getAthleteMileage", mileage);
  if ("error" in mileage) throw new Error(mileage.error);
  assertEquals(mileage.weeklyMileage, 45);

  // 7) getAthletesByGender(Female) → contains the user
  logStep("ACTION getAthletesByGender(Female)", {});
  const byGender = await concept.getAthletesByGender(Gender.Female);
  logStep("RESULT getAthletesByGender(Female)", byGender);
  if ("error" in byGender) throw new Error(byGender.error);
  const ids = new Set(byGender.athletes.map((u) => u._id));
  if (!ids.has(login.userId)) {
    throw new Error(`Expected athletes to include ${login.userId}, got ${JSON.stringify([...ids])}`);
  }

  // 8) Re-login (idempotent) → same user, flags cleared
  logStep("ACTION loginWithGoogle (again)", profile);
  const relogin = await concept.loginWithGoogle(profile);
  logStep("RESULT loginWithGoogle (again)", relogin);
  expectOk(relogin);
  if ("error" in relogin) return;
  assertEquals(relogin.userId, login.userId);
  assertEquals(relogin.needsName, false);
  assertEquals(relogin.needsRole, false);

  // DB snapshot sanity
  const user = readUserById(db, login.userId);
  assertExists(user);
  assertEquals(user!.name, "Taylor Runner");
  assertEquals(user!.role, Role.Athlete);
  assertEquals(user!.gender, Gender.Female);
  assertEquals(user!.weeklyMileage, 45);
});

// ============================================================================
// INTERESTING SCENARIOS — errors, overwrites, edge cases, id-token path
// ============================================================================

// --- ID token flow ---
Deno.test("idToken — oauth NOT configured → error", async () => {
  const { concept } = newConcept(); // no oauthClient, no googleClientId
  logStep("ACTION loginWithGoogleIdToken (unconfigured)", { idToken: "anything" });
  // @ts-ignore method exists in your concept
  const res = await (concept as any).loginWithGoogleIdToken("anything");
  logStep("RESULT", res);
  expectErr(res, "not configured");
});

Deno.test("idToken — mocked oauth + valid payload → creates/returns user", async () => {
  const mock = new MockOAuth2Client();
  mock.payload = {
    sub: "subD",
    email: "D@Example.com",
    email_verified: true,
    name: "Dee",
  };

  const { concept, db } = newConcept({
    oauthClient: mock as unknown as any,
    googleClientId: "test-client-id",
  });

  logStep("ACTION loginWithGoogleIdToken (valid)", { idToken: "valid.token" });
  // @ts-ignore method exists in your concept
  const res = await (concept as any).loginWithGoogleIdToken("valid.token");
  logStep("RESULT", res);
  expectOk(res);

  const user = readUserById(db, (res as any).userId);
  assertExists(user);
  assertEquals(user!.google?.sub, "subD");
  assertEquals(user!.email, normalizeEmail("D@Example.com")); // normalized
  assertEquals((res as any).needsName, false); // your impl sets name from payload
});

Deno.test("idToken — mocked oauth + email_verified:false → error", async () => {
  const mock = new MockOAuth2Client();
  mock.payload = {
    sub: "X1",
    email: "x@example.com",
    email_verified: false,
    name: "X",
  };

  const { concept } = newConcept({
    oauthClient: mock as unknown as any,
    googleClientId: "test-client-id",
  });

  logStep("ACTION loginWithGoogleIdToken (unverified)", { idToken: "valid.token" });
  // @ts-ignore method exists in your concept
  const res = await (concept as any).loginWithGoogleIdToken("valid.token");
  logStep("RESULT", res);
  expectErr(res, "verified");
});

// --- setName edge cases ---
Deno.test("setName — happy path updates user.name (NOT userName)", async () => {
  const { concept, db } = newConcept();
  const profile: GoogleProfile = { sub: "S1", email: "s1@EXAMPLE.com", emailVerified: true, name: null as any };
  const login = await concept.loginWithGoogle(profile);
  expectOk(login);
  if ("error" in login) return;

  logStep("ACTION setName", { userId: login.userId, name: "Alex Doe" });
  const res = await concept.setName(login.userId, "Alex Doe");
  logStep("RESULT setName", res);
  expectOk(res);

  const user = readUserById(db, login.userId);
  assertExists(user);
  assertEquals(user!.name, "Alex Doe");
  // @ts-ignore ensure no stray field
  assertEquals((user as any).userName, undefined);
});

Deno.test("setName — user not found", async () => {
  const { concept } = newConcept();
  const missing = "user_does_not_exist" as UserID;
  const res = await concept.setName(missing, "Alex");
  expectErr(res, "User not found");
});

// --- setGender overwrite & not-found ---
Deno.test("setGender — overwrite Male after Female", async () => {
  const { concept, db } = newConcept();
  const profile: GoogleProfile = { sub: "G1", email: "g1@example.com", emailVerified: true };
  const login = await concept.loginWithGoogle(profile);
  expectOk(login);
  if ("error" in login) return;

  await concept.setGender(login.userId, Gender.Female);
  await concept.setGender(login.userId, Gender.Male);

  const user = readUserById(db, login.userId);
  assertExists(user);
  assertEquals(user!.gender, Gender.Male);
});

Deno.test("setGender — user not found", async () => {
  const { concept } = newConcept();
  const missing = "nonexistent_user_id" as UserID;
  const res = await concept.setGender(missing, Gender.Female);
  expectErr(res, "User not found");
});

// --- setWeeklyMileage happy/overwrite/role guard/not-found ---
Deno.test("setWeeklyMileage — athlete happy path + overwrite", async () => {
  const { concept, db } = newConcept();
  const p: GoogleProfile = { sub: "WM_A1", email: "wma1@example.com", emailVerified: true };
  const login = await concept.loginWithGoogle(p);
  expectOk(login);
  if ("error" in login) return;
  await concept.setRole(login.userId, Role.Athlete);

  await concept.setWeeklyMileage(login.userId, 40);
  await concept.setWeeklyMileage(login.userId, 52);

  const user = readUserById(db, login.userId);
  assertExists(user);
  assertEquals(user!.weeklyMileage, 52);
});

Deno.test("setWeeklyMileage — coach should fail", async () => {
  const { concept } = newConcept();
  const p: GoogleProfile = { sub: "WM_C1", email: "wmc1@example.com", emailVerified: true };
  const login = await concept.loginWithGoogle(p);
  expectOk(login);
  if ("error" in login) return;
  await concept.setRole(login.userId, Role.Coach);

  const res = await concept.setWeeklyMileage(login.userId, 50);
  expectErr(res, "Only athletes can have weekly mileage");
});

Deno.test("setWeeklyMileage — user not found", async () => {
  const { concept } = newConcept();
  const res = await concept.setWeeklyMileage("nope_user" as UserID, 20);
  expectErr(res, "User not found");
});

// --- getAthleteMileage happy/null/role guard/not-found ---
Deno.test("getAthleteMileage — happy path returns set mileage", async () => {
  const { concept } = newConcept();
  const p: GoogleProfile = { sub: "GM_A1", email: "gma1@example.com", emailVerified: true };
  const login = await concept.loginWithGoogle(p);
  expectOk(login);
  if ("error" in login) return;
  await concept.setRole(login.userId, Role.Athlete);
  await concept.setWeeklyMileage(login.userId, 42);

  const res = await concept.getAthleteMileage(login.userId);
  if ("error" in res) throw new Error(res.error);
  assertEquals(res.weeklyMileage, 42);
});

Deno.test("getAthleteMileage — athlete with no mileage returns null", async () => {
  const { concept } = newConcept();
  const p: GoogleProfile = { sub: "GM_A2", email: "gma2@example.com", emailVerified: true };
  const login = await concept.loginWithGoogle(p);
  expectOk(login);
  if ("error" in login) return;
  await concept.setRole(login.userId, Role.Athlete);

  const res = await concept.getAthleteMileage(login.userId);
  if ("error" in res) throw new Error(res.error);
  assertEquals(res.weeklyMileage, null);
});

Deno.test("getAthleteMileage — coach should error", async () => {
  const { concept } = newConcept();
  const p: GoogleProfile = { sub: "GM_C1", email: "gmc1@example.com", emailVerified: true };
  const login = await concept.loginWithGoogle(p);
  expectOk(login);
  if ("error" in login) return;
  await concept.setRole(login.userId, Role.Coach);

  const res = await concept.getAthleteMileage(login.userId);
  expectErr(res, "Only athletes have weekly mileage");
});

Deno.test("getAthleteMileage — user not found", async () => {
  const { concept } = newConcept();
  const res = await concept.getAthleteMileage("missing_user_for_mileage" as UserID);
  expectErr(res, "User not found");
});

// --- getAthletesByGender filters + DB error ---
Deno.test("getAthletesByGender — filters only athletes of requested gender", async () => {
  const { concept } = newConcept();

  // Seed users
  const aF1: GoogleProfile = { sub: "GAF1", email: "af1@example.com", emailVerified: true };
  const aF2: GoogleProfile = { sub: "GAF2", email: "af2@example.com", emailVerified: true };
  const aM1: GoogleProfile = { sub: "GAM1", email: "am1@example.com", emailVerified: true };
  const coachF: GoogleProfile = { sub: "GCF", email: "cf@example.com", emailVerified: true };

  const rAF1 = await concept.loginWithGoogle(aF1); expectOk(rAF1);
  const rAF2 = await concept.loginWithGoogle(aF2); expectOk(rAF2);
  const rAM1 = await concept.loginWithGoogle(aM1); expectOk(rAM1);
  const rCF  = await concept.loginWithGoogle(coachF); expectOk(rCF);
  if ("error" in rAF1 || "error" in rAF2 || "error" in rAM1 || "error" in rCF) return;

  await concept.setRole(rAF1.userId, Role.Athlete);
  await concept.setGender(rAF1.userId, Gender.Female);
  await concept.setRole(rAF2.userId, Role.Athlete);
  await concept.setGender(rAF2.userId, Gender.Female);
  await concept.setRole(rAM1.userId, Role.Athlete);
  await concept.setGender(rAM1.userId, Gender.Male);
  await concept.setRole(rCF.userId, Role.Coach);
  await concept.setGender(rCF.userId, Gender.Female);

  const res = await concept.getAthletesByGender(Gender.Female);
  if ("error" in res) throw new Error(res.error);

  const ids = new Set(res.athletes.map((u) => u._id));
  const expectIds = new Set([rAF1.userId, rAF2.userId]); // exclude male athlete + female coach
  assertEquals(ids, expectIds);
});

Deno.test("getAthletesByGender — empty list when no matches", async () => {
  const { concept } = newConcept();
  const aM1: GoogleProfile = { sub: "GAM2", email: "am2@example.com", emailVerified: true };
  const aM2: GoogleProfile = { sub: "GAM3", email: "am3@example.com", emailVerified: true };
  const r1 = await concept.loginWithGoogle(aM1); expectOk(r1);
  const r2 = await concept.loginWithGoogle(aM2); expectOk(r2);
  if ("error" in r1 || "error" in r2) return;

  await concept.setRole(r1.userId, Role.Athlete);
  await concept.setGender(r1.userId, Gender.Male);
  await concept.setRole(r2.userId, Role.Athlete);
  await concept.setGender(r2.userId, Gender.Male);

  const res = await concept.getAthletesByGender(Gender.Female);
  if ("error" in res) throw new Error(res.error);
  assertEquals(res.athletes.length, 0);
});

Deno.test("getAthletesByGender — excludes coaches even if gender matches", async () => {
  const { concept } = newConcept();
  const coachF: GoogleProfile = { sub: "GCF2", email: "cf2@example.com", emailVerified: true };
  const r = await concept.loginWithGoogle(coachF); expectOk(r);
  if ("error" in r) return;
  await concept.setRole(r.userId, Role.Coach);
  await concept.setGender(r.userId, Gender.Female);

  const res = await concept.getAthletesByGender(Gender.Female);
  if ("error" in res) throw new Error(res.error);
  assertEquals(res.athletes.length, 0);
});

Deno.test("getAthletesByGender — DB failure surfaces as error", async () => {
  const { concept } = newConcept();
  const originalFind = (concept as any).users.find;
  (concept as any).users.find = () => { throw new Error("boom"); };

  const res = await concept.getAthletesByGender(Gender.Male);
  expectErr(res, "database operation error");

  (concept as any).users.find = originalFind; // restore
});
