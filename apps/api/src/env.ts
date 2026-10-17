import { z } from "zod";

/** Treat empty strings (for example `DATABASE_URL=` in a local `.env`) as unset. */
const unsetIfEmpty = (value: unknown): unknown => (value === "" ? undefined : value);

/**
 * Env for the Kitty service API (`apps/api`).
 *
 * Validated at import time so a misconfigured service fails on startup instead
 * of at the first request. Variables that the service does not use yet are
 * optional, so the skeleton (and its tests) run without a full `.env`.
 * See `docs/08-infrastructure.md` and `apps/api/.env.example` for where each
 * value comes from.
 */
export const envSchema = z
  .object({
    // Runtime
    NODE_ENV: z.preprocess(
      unsetIfEmpty,
      z.enum(["development", "test", "production"]).default("development"),
    ),
    PORT: z.preprocess(unsetIfEmpty, z.coerce.number().int().positive().default(8787)),

    // Neon Postgres pooled connection used by the app. drizzle-kit migrations use
    // DATABASE_URL_UNPOOLED from packages/db/.env (packages/db/drizzle.config.ts).
    DATABASE_URL: z.preprocess(unsetIfEmpty, z.url().optional()),

    // Better Auth (server lives here; clients call it through the web proxy).
    // 32+ characters (ADR-029); Better Auth refuses weak secrets in production.
    BETTER_AUTH_SECRET: z.preprocess(unsetIfEmpty, z.string().min(32).optional()),
    BETTER_AUTH_URL: z.preprocess(unsetIfEmpty, z.url().optional()),

    // Public origin of the web app: allowed to call this API and the base of
    // every link we email (reset password, verify email).
    WEB_ORIGIN: z.preprocess(unsetIfEmpty, z.url().optional()),

    // --- Social sign-in (optional; each provider is registered only when both
    // of its values are present — `GET /api/auth-config` reports the result) ---
    // GitHub: Settings → Developer settings → OAuth Apps.
    GITHUB_CLIENT_ID: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    GITHUB_CLIENT_SECRET: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    // PayPal "Log in with PayPal" — a SEPARATE REST app with only the login
    // feature enabled, never the money app (ADR-028, AGENTS.md invariant #1).
    PAYPAL_LOGIN_CLIENT_ID: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    PAYPAL_LOGIN_CLIENT_SECRET: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    PAYPAL_LOGIN_ENV: z.preprocess(unsetIfEmpty, z.enum(["sandbox", "live"]).default("sandbox")),

    // --- Transactional email (optional; console fallback in development) ---
    // Resend: resend.com → API Keys. MAIL_FROM needs a verified domain/sender.
    RESEND_API_KEY: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
    MAIL_FROM: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),

    // Force email verification on/off. Unset = on in production when a real
    // mailer is configured (ADR-029); off in development/test.
    AUTH_REQUIRE_EMAIL_VERIFICATION: z.preprocess(unsetIfEmpty, z.stringbool().optional()),

    // Password of the seeded demo accounts (organizer@demo.kitty). Powers the
    // "Try the demo (for judges)" button; never exposed to the browser.
    DEMO_USER_PASSWORD: z.preprocess(unsetIfEmpty, z.string().min(8).optional()),

    // One-click demo login flag. OFF by default — enable it only on the judge
    // demo deployment, where the seeded demo account is meant to be public.
    DEMO_LOGIN_ENABLED: z.preprocess(unsetIfEmpty, z.stringbool().default(false)),

    // Leash Gateway Admin API.
    GATEWAY_URL: z.preprocess(unsetIfEmpty, z.url().optional()),
    GATEWAY_ADMIN_TOKEN: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
  })
  .superRefine((value, ctx) => {
    // A provider half-configured would silently never appear in the UI. Fail
    // loudly at boot instead of shipping a broken "Continue with …" button.
    const pairs = [
      ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
      ["PAYPAL_LOGIN_CLIENT_ID", "PAYPAL_LOGIN_CLIENT_SECRET"],
      ["RESEND_API_KEY", "MAIL_FROM"],
    ] as const;

    for (const [left, right] of pairs) {
      const hasLeft = value[left] !== undefined;
      const hasRight = value[right] !== undefined;

      if (hasLeft !== hasRight) {
        ctx.addIssue({
          code: "custom",
          path: [hasLeft ? right : left],
          message: `${left} and ${right} must be set together`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parses env explicitly; exported so tests can exercise the schema. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

export const env: Env = parseEnv(process.env);
