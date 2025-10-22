import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { getDb } from "@utils/database.ts";
import { walk } from "@std/fs";
import { parseArgs } from "@std/cli/parse-args";
import { toFileUrl } from "@std/path/to-file-url";

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
const CONCEPTS_DIR = "src/concepts";

/**
 * Main server function to initialize DB, load concepts, and start the server.
 */
async function main() {
  const [db] = await getDb();
  const app = new Hono();

  // CORS for local Vite dev server
  const VITE_ORIGIN = Deno.env.get("VITE_ORIGIN") ?? "http://localhost:5173";
  app.use(
    "/*",
    cors({
      origin: VITE_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
    })
  );

  app.get("/", (c: Context) => c.text("Concept Server is running."));

  // --- Dynamic Concept Loading and Routing ---
  console.log(`Scanning for concepts in ./${CONCEPTS_DIR}...`);

  for await (const entry of walk(CONCEPTS_DIR, {
    maxDepth: 1,
    includeDirs: true,
    includeFiles: false,
  })) {
    if (entry.path === CONCEPTS_DIR) continue; // Skip the root directory

    const conceptName = entry.name;
    const conceptFilePath = `${entry.path}/${conceptName}Concept.ts`;

    try {
      const modulePath = toFileUrl(Deno.realPathSync(conceptFilePath)).href;
      const module = await import(modulePath);
      const ConceptClass = module.default;

      if (
        typeof ConceptClass !== "function" ||
        !ConceptClass.name.endsWith("Concept")
      ) {
        console.warn(
          `! No valid concept class found in ${conceptFilePath}. Skipping.`
        );
        continue;
      }

      // Optionally pass concept-specific options
      type ConceptInstance = Record<string, unknown> & {
        [method: string]: unknown;
      };
      let instance: ConceptInstance;

      // Provide Google OAuth verification to UserDirectoryConcept if configured
      if (conceptName === "UserDirectory") {
        const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
        if (googleClientId) {
          // Lazy import to avoid npm dependency for other concepts
          const { OAuth2Client } = await import("google-auth-library");
          instance = new ConceptClass(db, {
            oauthClient: new OAuth2Client(googleClientId),
            googleClientId,
          });
        } else {
          instance = new ConceptClass(db);
        }
      } else {
        instance = new ConceptClass(db);
      }
      const conceptApiName = conceptName;
      console.log(
        `- Registering concept: ${conceptName} at ${BASE_URL}/${conceptApiName}`
      );

      const methodNames = Object.getOwnPropertyNames(
        Object.getPrototypeOf(instance)
      ).filter(
        (name) => name !== "constructor" && typeof instance[name] === "function"
      );

      for (const methodName of methodNames) {
        const actionName = methodName;
        const route = `${BASE_URL}/${conceptApiName}/${actionName}`;

        app.post(route, async (c: Context) => {
          try {
            const body = await c.req.json().catch(() => ({})); // Handle empty body
            const handler = instance[methodName];
            if (typeof handler !== "function") {
              return c.json(
                { error: `Method ${methodName} is not callable.` },
                400
              );
            }
            if (
              conceptName === "UserDirectory" &&
              methodName === "loginWithGoogleIdToken"
            ) {
              console.log(
                "[UserDirectory.loginWithGoogleIdToken] incoming keys:",
                body && typeof body === "object"
                  ? Object.keys(body as Record<string, unknown>)
                  : typeof body
              );
            }
            const result = await (
              handler as (arg: unknown) => unknown | Promise<unknown>
            )(body);
            if (
              conceptName === "UserDirectory" &&
              methodName === "loginWithGoogleIdToken"
            ) {
              console.log(
                "[UserDirectory.loginWithGoogleIdToken] result:",
                result
              );
            }
            return c.json(result);
          } catch (e) {
            console.error(`Error in ${conceptName}.${methodName}:`, e);
            return c.json({ error: "An internal server error occurred." }, 500);
          }
        });
        console.log(`  - Endpoint: POST ${route}`);
      }
    } catch (e) {
      console.error(`! Error loading concept from ${conceptFilePath}:`, e);
    }
  }

  console.log(`\nServer listening on http://localhost:${PORT}`);
  Deno.serve({ port: PORT }, app.fetch);
}

// Run the server
main();
