import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { getDb } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import { parseArgs } from "@std/cli/parse-args";
// (no dynamic module loading needed here)
import UserDirectoryConcept from "@concepts/UserDirectory/UserDirectoryConcept.ts";
import { Role, Gender } from "@concepts/UserDirectory/UserDirectoryConcept.ts";
import type { User } from "@concepts/UserDirectory/UserDirectoryConcept.ts";
import TeamMembershipConcept from "@concepts/TeamMembership/TeamMembershipConcept.ts";
import TrainingRecordsConcept from "@concepts/TrainingRecords/TrainingRecordsConcept.ts";
import CalanderEventConcept from "@concepts/CalanderEvent/CalanderEventConcept.ts";
import NotificationsConcept from "@concepts/Notification/NotificationConcept.ts";
import { OAuth2Client } from "google-auth-library";
import type { Auth } from "googleapis";
import type { Team } from "@concepts/TeamMembership/TeamMembershipConcept.ts";
import type { Event } from "@concepts/CalanderEvent/CalanderEventConcept.ts";
import type { WeeklySummary } from "@concepts/TrainingRecords/TrainingRecordsConcept.ts";
// Parse command-line arguments for port and base URL
const flags = parseArgs(Deno.args, {
  string: ["port", "baseUrl"],
  default: {
    port: "8000",
    baseUrl: "/api",
  },
});

const PORT = parseInt(flags.port, 10);
const BASE_URL = flags.baseUrl;
// Note: dynamic concept scanning omitted for this simplified explicit route version

/**
 * Main server function to initialize DB, load concepts, and start the server.
 */
async function main() {
  const [db] = await getDb();
  const app = new Hono();

  // Instantiate UserDirectory concept once and reuse
  const userDirectory = new UserDirectoryConcept(db);
  const teamMembership = new TeamMembershipConcept(db);
  const trainingRecords = new TrainingRecordsConcept(db);
  const calanderEvent = new CalanderEventConcept(db);
  // Helper to build an OAuth2 client for Gmail using env vars, or return null if not configured
  function buildGmailOAuthClient(): Auth.OAuth2Client | null {
    try {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

      if (!clientId || !clientSecret || !refreshToken) {
        console.warn(
          "⚠️  Gmail notifications not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env"
        );
        console.warn("   See GMAIL_SETUP.md for instructions");
        return null;
      }

      const oauth = new OAuth2Client({ clientId, clientSecret });
      oauth.setCredentials({ refresh_token: refreshToken });
      console.log("✅ Gmail OAuth configured successfully");
      return oauth as unknown as Auth.OAuth2Client;
    } catch (error) {
      console.error("❌ Error configuring Gmail OAuth:", error);
      return null;
    }
  }

  // CORS for local Vite dev server (robust to 127.0.0.1 vs localhost)
  const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
  const CORS_ORIGINS = (Deno.env.get("CORS_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ALLOWED_ORIGINS = CORS_ORIGINS.length ? CORS_ORIGINS : DEFAULT_ORIGINS;

  app.use(
    "/*",
    cors({
      origin: (origin: string, _c: Context) =>
        origin && ALLOWED_ORIGINS.includes(origin) ? origin : null,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "authorization",
        "X-Requested-With",
      ],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
    })
  );

  app.get("/", (c: Context) => c.text("Concept Server is running."));
  // Explicit endpoint wired to the concept

  app.post(
    `${BASE_URL}/UserDirectory/loginWithGoogleIdToken`,
    async (c: Context) => {
      try {
        const body = await c.req.json().catch(() => ({}));
        console.log("Received loginWithGoogleIdToken request with body:", body);
        const result = await userDirectory.loginWithGoogleIdToken(body);
        return c.json(result);
      } catch (e) {
        console.error(
          "Error in explicit UserDirectory.loginWithGoogleIdToken:",
          e
        );
        return c.json({ error: "An internal server error occurred." }, 500);
      }
    }
  );

  app.post(`${BASE_URL}/UserDirectory/editUserMileage`, async (c: Context) => {
    try {
      console.log("Received editUserMileage request");
      const body = await c.req.json();
      const { userId, newMileage } = body || {};
      const result = await userDirectory.setWeeklyMileage(
        userId as ID,
        Number(newMileage)
      );
      return c.json(result);
    } catch (e) {
      console.error("Error in explicit UserDirectory.editUserMileage:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Fetch a user by ID
  app.get(`${BASE_URL}/UserDirectory/getUser`, async (c: Context) => {
    try {
      const userId = c.req.query("userId");
      if (!userId) return c.json({ error: "Missing userId" }, 400);
      const result = await userDirectory.getUser(userId as ID);
      return c.json(result);
    } catch (e) {
      console.error("Error in explicit UserDirectory.getUser:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });
  app.post(`${BASE_URL}/UserDirectory/editUserRole`, async (c: Context) => {
    try {
      const body = await c.req.json();
      console.log("Received editUserRole request:", body);
      const { userId, role } = body || {};
      const result = await userDirectory.setRole(userId as ID, role as Role);
      console.log("editUserRole result:", result);
      return c.json(result);
    } catch (e) {
      console.error("Error in explicit UserDirectory.editUserRole:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // --- TeamMembership Endpoints ---
  // Create team (coach only)
  app.post(`${BASE_URL}/TeamMembership/createTeam`, async (c: Context) => {
    try {
      const body = await c.req.json();
      const { coachId, title, passKey } = body || {};
      if (!coachId || !title || !passKey) {
        return c.json({ error: "Missing coachId, title or passKey" }, 400);
      }
      const coachResult = await userDirectory.getUser(coachId as ID);
      if ("error" in (coachResult as { error?: string }))
        return c.json(coachResult, 400);
      const coach = coachResult as User;
      const result = await teamMembership.createTeam(title, coach, passKey);
      return c.json(result);
    } catch (e) {
      console.error("Error in TeamMembership.createTeam:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Join team (athlete)
  app.post(`${BASE_URL}/TeamMembership/joinTeam`, async (c: Context) => {
    try {
      const body = await c.req.json();
      const { athleteId, title, passKey } = body || {};
      if (!athleteId || !title || !passKey) {
        return c.json({ error: "Missing athleteId, title or passKey" }, 400);
      }
      const athleteResult = await userDirectory.getUser(athleteId as ID);
      if ("error" in (athleteResult as { error?: string }))
        return c.json(athleteResult, 400);
      const athlete = athleteResult as User;
      const result = await teamMembership.addAthlete(title, athlete, passKey);
      return c.json(result);
    } catch (e) {
      console.error("Error in TeamMembership.joinTeam:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Leave team (athlete)
  app.post(`${BASE_URL}/TeamMembership/leaveTeam`, async (c: Context) => {
    try {
      const body = await c.req.json();
      const { athleteId, title } = body || {};
      if (!athleteId || !title) {
        return c.json({ error: "Missing athleteId or title" }, 400);
      }
      const athleteResult = await userDirectory.getUser(athleteId as ID);
      if ("error" in (athleteResult as { error?: string }))
        return c.json(athleteResult, 400);
      const athlete = athleteResult as User;
      const result = await teamMembership.removeAthlete(title, athlete);
      return c.json(result);
    } catch (e) {
      console.error("Error in TeamMembership.leaveTeam:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Get team by coach
  app.get(`${BASE_URL}/TeamMembership/getTeamByCoach`, async (c: Context) => {
    try {
      const coachId = c.req.query("coachId");
      if (!coachId) return c.json({ error: "Missing coachId" }, 400);
      const coachResult = await userDirectory.getUser(coachId as ID);
      if ("error" in (coachResult as { error?: string }))
        return c.json(coachResult, 400);
      const coach = coachResult as User;
      const result = await teamMembership.getTeamByCoach(coach);
      return c.json(result);
    } catch (e) {
      console.error("Error in TeamMembership.getTeamByCoach:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Get team by athlete
  app.get(`${BASE_URL}/TeamMembership/getTeamByAthlete`, async (c: Context) => {
    try {
      const athleteId = c.req.query("athleteId");
      if (!athleteId) return c.json({ error: "Missing athleteId" }, 400);
      const athleteResult = await userDirectory.getUser(athleteId as ID);
      if ("error" in (athleteResult as { error?: string }))
        return c.json(athleteResult, 400);
      const athlete = athleteResult as User;
      const result = await teamMembership.getTeamByAthlete(athlete);
      return c.json(result);
    } catch (e) {
      console.error("Error in TeamMembership.getTeamByAthlete:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Get athletes by team
  app.get(
    `${BASE_URL}/TeamMembership/getAthletesByTeam`,
    async (c: Context) => {
      try {
        const teamId = c.req.query("teamId");
        if (!teamId) return c.json({ error: "Missing teamId" }, 400);
        const result = await teamMembership.getAthletesByTeam(teamId as ID);
        return c.json(result);
      } catch (e) {
        console.error("Error in TeamMembership.getAthletesByTeam:", e);
        return c.json({ error: "An internal server error occurred." }, 500);
      }
    }
  );

  app.post(`${BASE_URL}/UserDirectory/editUserGender`, async (c: Context) => {
    try {
      const body = await c.req.json();
      console.log("Received editUserGender request:", body);
      const { userId, gender } = body || {};
      const result = await userDirectory.setGender(
        userId as ID,
        gender as Gender
      );
      console.log("editUserGender result:", result);
      return c.json(result);
    } catch (e) {
      console.error("Error in explicit UserDirectory.editUserGender:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // --- CalanderEvent Endpoints ---
  // Create event (POST)
  app.post(`${BASE_URL}/CalanderEvent/createEvent`, async (c: Context) => {
    try {
      const body = await c.req.json();
      console.log("Received CalanderEvent.createEvent request:", body);
      const { teamId, title, location, startTime, endTime, description, link } =
        body || {};

      if (!teamId || !title || !location || !startTime || !endTime) {
        return c.json(
          { error: "Missing teamId, title, location, startTime, or endTime" },
          400
        );
      }

      const start = new Date(startTime);
      const end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return c.json({ error: "Invalid startTime or endTime" }, 400);
      }
      if (start.getTime() >= end.getTime()) {
        return c.json(
          { error: "Event start time must be before end time." },
          400
        );
      }

      const result = await calanderEvent.createEvent(
        teamId as ID,
        start,
        end,
        String(location),
        String(title),
        description ?? undefined,
        link ?? undefined
      );
      return c.json(result);
    } catch (e) {
      console.error("Error in CalanderEvent.createEvent:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Edit event (POST)
  app.post(`${BASE_URL}/CalanderEvent/editEvent`, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { eventId, updates } = body || {};
      if (!eventId || !updates || typeof updates !== "object") {
        return c.json({ error: "Missing eventId or updates" }, 400);
      }

      // Convert potential date strings to Date objects
      const u: Record<string, unknown> = { ...updates };
      if (u.startTime != null) {
        const d = new Date(u.startTime as string);
        if (isNaN(d.getTime()))
          return c.json({ error: "Invalid startTime" }, 400);
        u.startTime = d;
      }
      if (u.endTime != null) {
        const d = new Date(u.endTime as string);
        if (isNaN(d.getTime()))
          return c.json({ error: "Invalid endTime" }, 400);
        u.endTime = d;
      }

      const result = await calanderEvent.editEvent(
        eventId as ID,
        u as Partial<Omit<Event, "_id">>
      );
      return c.json(result);
    } catch (e) {
      console.error("Error in CalanderEvent.editEvent:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Delete event (POST)
  app.post(`${BASE_URL}/CalanderEvent/deleteEvent`, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { eventId } = body || {};
      if (!eventId) return c.json({ error: "Missing eventId" }, 400);
      const result = await calanderEvent.deleteEvent(eventId as ID);
      return c.json(result);
    } catch (e) {
      console.error("Error in CalanderEvent.deleteEvent:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Get events by specific date (GET)
  app.get(`${BASE_URL}/CalanderEvent/getEventsByDate`, async (c: Context) => {
    console.log("Received CalanderEvent.getEventsByDate request");
    try {
      const dayStr = c.req.query("day");
      const monthStr = c.req.query("month");
      const yearStr = c.req.query("year");
      const teamId = c.req.query("teamId");

      if (!dayStr || !monthStr || !yearStr || !teamId) {
        return c.json({ error: "Missing teamId, day, month, or year" }, 400);
      }

      const day = Number(dayStr);
      const month = Number(monthStr);
      const year = Number(yearStr);

      if (
        !Number.isInteger(day) ||
        !Number.isInteger(month) ||
        !Number.isInteger(year)
      ) {
        return c.json({ error: "day, month and year must be integers" }, 400);
      }

      const result = await calanderEvent.getEventsByDate(
        day,
        month,
        year,
        teamId as ID
      );
      return c.json(result);
    } catch (e) {
      console.error("Error in CalanderEvent.getEventsByDate:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // --- TrainingRecords Endpoints ---
  // Log daily entry (POST)
  app.post(`${BASE_URL}/TrainingRecords/logDailyEntry`, async (c: Context) => {
    try {
      const body = await c.req.json();
      console.log("Received logDailyEntry request:", body);
      const result = await trainingRecords.logDailyEntry(body);
      return c.json(result);
    } catch (e) {
      console.error("Error in TrainingRecords.logDailyEntry:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // List entries (GET)
  app.get(`${BASE_URL}/TrainingRecords/listEntries`, async (c: Context) => {
    try {
      const userId = c.req.query("userId");
      const from = c.req.query("from");
      const to = c.req.query("to");

      if (!userId) {
        return c.json({ error: "Missing userId" }, 400);
      }

      const result = await trainingRecords.listEntries({
        userId: userId as ID,
        from,
        to,
      });
      console.log("listEntries result:", result);
      return c.json(result);
    } catch (e) {
      console.error("Error in TrainingRecords.listEntries:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // Get weekly summaries for each athlete on the requester's team
  // GET /TrainingRecords/getTeamWeeklySummaries?userId=...&date=YYYY-MM-DD(optional)
  app.get(
    `${BASE_URL}/TrainingRecords/getTeamWeeklySummaries`,
    async (c: Context) => {
      try {
        const isError = (v: unknown): v is { error: string } =>
          !!v && typeof v === "object" && "error" in v;
        const userId = c.req.query("userId");
        const dateStr = c.req.query("date");
        if (!userId) return c.json({ error: "Missing userId" }, 400);

        // Resolve requester
        const requesterRes = await userDirectory.getUser(userId as ID);
        if (isError(requesterRes)) return c.json(requesterRes, 400);
        const requester = requesterRes as User;

        // Determine the team for requester (coach preferred, else athlete)
        const teamOrErr = await teamMembership.getTeamByCoach(requester);
        let team: Team | { error: string } = teamOrErr as
          | Team
          | { error: string };
        if (isError(team)) {
          const t2 = await teamMembership.getTeamByAthlete(requester);
          team = t2 as Team | { error: string };
        }
        if (isError(team))
          return c.json({ error: "Requester not associated with a team" }, 400);

        const date = dateStr ? new Date(dateStr) : new Date();
        console.log(date);
        if (isNaN(date.getTime()))
          return c.json({ error: "Invalid date" }, 400);

        const athletes: User[] = (team as Team).athletes || [];
        const summaries: Array<
          WeeklySummary | { error: string; athlete?: User }
        > = [];
        for (const a of athletes) {
          const s = await trainingRecords.createWeeklySummary(a, date);
          // attach athlete reference for easier frontend mapping
          if (isError(s)) {
            summaries.push({ ...s, athlete: a });
          } else {
            summaries.push(s as WeeklySummary);
          }
        }

        return c.json({ summaries });
      } catch (e) {
        console.error("Error in TrainingRecords.getTeamWeeklySummaries:", e);
        return c.json({ error: "An internal server error occurred." }, 500);
      }
    }
  );

  // --- Dynamic Concept Loading and Routing ---
  // --- Notifications Endpoints ---
  app.post(`${BASE_URL}/Notifications/sendNow`, async (c: Context) => {
    try {
      const body = await c.req.json();
      const { senderId, eventIds, additionalMessage, scheduledAt } = body || {};
      if (!senderId || !Array.isArray(eventIds) || eventIds.length === 0) {
        return c.json({ error: "Missing senderId or eventIds" }, 400);
      }

      const isError = (v: unknown): v is { error: string } =>
        !!v && typeof v === "object" && "error" in v;

      // Sender
      const senderRes = await userDirectory.getUser(senderId as ID);
      if (isError(senderRes)) return c.json(senderRes, 400);
      const sender = senderRes as User;

      // Team (coach, else athlete)
      let teamRes = await teamMembership.getTeamByCoach(sender);
      if (isError(teamRes))
        teamRes = await teamMembership.getTeamByAthlete(sender);
      if (isError(teamRes))
        return c.json({ error: "Sender is not associated with a team" }, 400);
      const team = teamRes as Team;

      const recipients = team.athletes || [];
      if (!recipients.length)
        return c.json({ error: "No athletes found on the team" }, 400);

      console.log(
        "sending to",
        recipients.map((r) => r.email)
      );
      // Events
      const events: Event[] = [];
      for (const eid of eventIds) {
        const evRes = await calanderEvent.getEvent(eid as ID);
        if (isError(evRes)) return c.json(evRes, 400);
        events.push(evRes as Event);
      }

      const oauth = buildGmailOAuthClient();
      if (!oauth) {
        return c.json(
          {
            error:
              "Email notifications are not configured. Please contact your administrator to set up Gmail API credentials.",
          },
          503
        );
      }
      const notifications = new NotificationsConcept(db, oauth, "Team Updates");

      let sched: Date | undefined;
      if (scheduledAt) {
        const d = new Date(scheduledAt);
        if (isNaN(d.getTime()))
          return c.json({ error: "Invalid scheduledAt" }, 400);
        sched = d;
      } else {
        sched = new Date(Date.now() + 60_000);
      }

      const created = await notifications.create(
        sender,
        recipients,
        events,
        (additionalMessage as string) || "",
        sched
      );
      if (isError(created)) return c.json(created, 400);
      const id = created.id as ID;

      const sent = await notifications.send(id);
      if (isError(sent)) return c.json(sent, 500);
      return c.json({ ok: true, id });
    } catch (e) {
      console.error("Error in Notifications.sendNow:", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });
  console.log(`\nServer listening on http://localhost:${PORT}`);
  Deno.serve({ port: PORT }, app.fetch);
}

// Run the server
main();
