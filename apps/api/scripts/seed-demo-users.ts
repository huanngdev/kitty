import { user } from "@kitty/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "../src/lib/auth";
import { getDb } from "../src/lib/db";

/**
 * Seeds the demo accounts used by the "Continue as demo organizer" button and by
 * judges (docs/23-user-screen-flow.md §2).
 *
 * Run from the repo root: `bun run seed:demo-users` (the script loads
 * `apps/api/.env`, which must define DEMO_USER_PASSWORD, DATABASE_URL and the
 * Better Auth variables).
 *
 * Idempotent: existing accounts are left untouched (their password is not
 * rotated) and only the `is_demo` flag is repaired. Passwords are hashed by
 * Better Auth's `signUpEmail` — this script never touches password hashes.
 */
const seedEnvSchema = z.object({
  DEMO_USER_PASSWORD: z.string().min(8, "DEMO_USER_PASSWORD must be at least 8 characters"),
});

const parsedEnv = seedEnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // Names only — never print values (AGENTS.md invariant #11).
  const missing = parsedEnv.error.issues.map((issue) => issue.path.join("."));
  console.error(
    `Missing or invalid seed env: ${missing.join(", ")}. ` +
      "Add DEMO_USER_PASSWORD to apps/api/.env (see apps/api/.env.example).",
  );
  process.exit(1);
}

// Read once at module scope so the narrowed `parsedEnv.data` is not lost inside
// the `main` closure (TS resets narrowing for captured variables).
const { DEMO_USER_PASSWORD: demoUserPassword } = parsedEnv.data;

const demoUsers = [
  { name: "Mai (Demo Organizer)", email: "organizer@demo.kitty" },
  { name: "Tuan (Demo Member)", email: "member@demo.kitty" },
] as const;

type SeedOutcome = "created" | "updated" | "unchanged";

async function seedDemoUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<SeedOutcome> {
  const db = getDb();
  const [existing] = await db.select().from(user).where(eq(user.email, input.email)).limit(1);

  const outcome: SeedOutcome =
    existing === undefined ? "created" : existing.isDemo ? "unchanged" : "updated";

  if (existing === undefined) {
    try {
      await getAuth().api.signUpEmail({
        body: { name: input.name, email: input.email, password: input.password },
      });
    } catch (error) {
      // A concurrent seed may have created the account between the SELECT and
      // the insert; re-check before treating it as a real failure.
      const [created] = await db.select().from(user).where(eq(user.email, input.email)).limit(1);

      if (created === undefined) {
        throw error;
      }
    }
  }

  const [seeded] = await db
    .update(user)
    .set({ isDemo: true })
    .where(eq(user.email, input.email))
    .returning({ id: user.id, isDemo: user.isDemo });

  if (seeded === undefined) {
    throw new Error(`Demo user ${input.email} disappeared while seeding`);
  }

  return outcome;
}

async function main(): Promise<void> {
  const password = demoUserPassword;

  for (const demoUser of demoUsers) {
    const outcome = await seedDemoUser({ ...demoUser, password });
    console.log(`${demoUser.email}: ${outcome}`);
  }

  await getDb().$client.end();
  console.log("Demo accounts ready. Sign in with the emails above and DEMO_USER_PASSWORD.");
}

await main();
