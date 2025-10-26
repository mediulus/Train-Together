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
      allowMethods: ["POST", "OPTIONS"],
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

  // Health endpoint via POST to keep POST-only policy
  app.post("/", (c: Context) => c.text("Concept Server is running."));
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

  // POST variant for unified POST style
  app.post(`${BASE_URL}/UserDirectory/getUser`, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { userId } = body || {};
      if (!userId) return c.json({ error: "Missing userId" }, 400);
      const result = await userDirectory.getUser(userId as ID);
      return c.json(result);
    } catch (e) {
      console.error("Error in explicit UserDirectory.getUser (POST):", e);
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

  // POST variant for unified POST style
  app.post(`${BASE_URL}/TeamMembership/getTeamByCoach`, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { coachId } = body || {};
      if (!coachId) return c.json({ error: "Missing coachId" }, 400);
      const coachResult = await userDirectory.getUser(coachId as ID);
      if ("error" in (coachResult as { error?: string }))
        return c.json(coachResult, 400);
      const coach = coachResult as User;
      const result = await teamMembership.getTeamByCoach(coach);
      return c.json(result);
    } catch (e) {
      console.error("Error in TeamMembership.getTeamByCoach (POST):", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // POST variant for unified POST style
  app.post(
    `${BASE_URL}/TeamMembership/getTeamByAthlete`,
    async (c: Context) => {
      try {
        const body = await c.req.json().catch(() => ({}));
        const { athleteId } = body || {};
        if (!athleteId) return c.json({ error: "Missing athleteId" }, 400);
        const athleteResult = await userDirectory.getUser(athleteId as ID);
        if ("error" in (athleteResult as { error?: string }))
          return c.json(athleteResult, 400);
        const athlete = athleteResult as User;
        const result = await teamMembership.getTeamByAthlete(athlete);
        return c.json(result);
      } catch (e) {
        console.error("Error in TeamMembership.getTeamByAthlete (POST):", e);
        return c.json({ error: "An internal server error occurred." }, 500);
      }
    }
  );

  // POST variant for unified POST style
  app.post(
    `${BASE_URL}/TeamMembership/getAthletesByTeam`,
    async (c: Context) => {
      try {
        const body = await c.req.json().catch(() => ({}));
        const { teamId } = body || {};
        if (!teamId) return c.json({ error: "Missing teamId" }, 400);
        const result = await teamMembership.getAthletesByTeam(teamId as ID);
        return c.json(result);
      } catch (e) {
        console.error("Error in TeamMembership.getAthletesByTeam (POST):", e);
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

  // POST variant for unified POST style
  app.post(`${BASE_URL}/CalanderEvent/getEventsByDate`, async (c: Context) => {
    console.log("Received CalanderEvent.getEventsByDate (POST) request");
    try {
      const body = await c.req.json().catch(() => ({}));
      const { day, month, year, teamId } = body || {};
      if (day == null || month == null || year == null || !teamId) {
        return c.json({ error: "Missing teamId, day, month, or year" }, 400);
      }
      const dayNum = Number(day);
      const monthNum = Number(month);
      const yearNum = Number(year);
      if (
        !Number.isInteger(dayNum) ||
        !Number.isInteger(monthNum) ||
        !Number.isInteger(yearNum)
      ) {
        return c.json({ error: "day, month and year must be integers" }, 400);
      }
      const result = await calanderEvent.getEventsByDate(
        dayNum,
        monthNum,
        yearNum,
        teamId as ID
      );
      return c.json(result);
    } catch (e) {
      console.error("Error in CalanderEvent.getEventsByDate (POST):", e);
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

  // POST variant for unified POST style
  app.post(`${BASE_URL}/TrainingRecords/listEntries`, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { userId, from, to } = body || {};
      if (!userId) {
        return c.json({ error: "Missing userId" }, 400);
      }
      const result = await trainingRecords.listEntries({
        userId: userId as ID,
        from,
        to,
      });
      return c.json(result);
    } catch (e) {
      console.error("Error in TrainingRecords.listEntries (POST):", e);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  // POST variant for unified POST style
  app.post(
    `${BASE_URL}/TrainingRecords/getTeamWeeklySummaries`,
    async (c: Context) => {
      try {
        const isError = (v: unknown): v is { error: string } =>
          !!v && typeof v === "object" && "error" in v;
        const body = await c.req.json().catch(() => ({}));
        const { userId, date } = body || {};
        if (!userId) return c.json({ error: "Missing userId" }, 400);

        const requesterRes = await userDirectory.getUser(userId as ID);
        if (isError(requesterRes)) return c.json(requesterRes, 400);
        const requester = requesterRes as User;

        let teamOrErr = await teamMembership.getTeamByCoach(requester);
        if (isError(teamOrErr))
          teamOrErr = await teamMembership.getTeamByAthlete(requester);
        if (isError(teamOrErr))
          return c.json({ error: "Requester not associated with a team" }, 400);

        const when = date ? new Date(date) : new Date();
        if (isNaN(when.getTime()))
          return c.json({ error: "Invalid date" }, 400);

        const team = teamOrErr as Team;
        const athletes: User[] = team.athletes || [];
        const summaries: Array<
          WeeklySummary | { error: string; athlete?: User }
        > = [];
        for (const a of athletes) {
          const s = await trainingRecords.createWeeklySummary(a, when);
          if (isError(s)) summaries.push({ ...s, athlete: a });
          else summaries.push(s as WeeklySummary);
        }
        return c.json({ summaries });
      } catch (e) {
        console.error(
          "Error in TrainingRecords.getTeamWeeklySummaries (POST):",
          e
        );
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
