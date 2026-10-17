import { z } from "zod";

/** Treat empty strings (for example `PAYPAL_CLIENT_ID=` in a local `.env`) as unset. */
const unsetIfEmpty = (value: unknown): unknown => (value === "" ? undefined : value);

/**
 * Env for the Leash Gateway (`apps/gateway`).
 *
 * This service is the only one allowed to hold PayPal credentials (AGENTS.md
 * invariant #1) — the names below must never appear in another app's env. The
 * PayPal variables stay optional until the sandbox check is wired. See
 * `docs/08-infrastructure.md` for where each value comes from.
 */
const envSchema = z.object({
  // Runtime
  NODE_ENV: z.preprocess(
    unsetIfEmpty,
    z.enum(["development", "test", "production"]).default("development"),
  ),
  PORT: z.preprocess(unsetIfEmpty, z.coerce.number().int().positive().default(8788)),

  // Neon Postgres pooled connection used by the app. drizzle-kit migrations use
  // DATABASE_URL_UNPOOLED from packages/db/.env (packages/db/drizzle.config.ts).
  DATABASE_URL: z.preprocess(unsetIfEmpty, z.url().optional()),

  // PayPal (sandbox for the hackathon).
  PAYPAL_ENV: z.preprocess(unsetIfEmpty, z.enum(["sandbox", "live"]).default("sandbox")),
  PAYPAL_CLIENT_ID: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
  PAYPAL_CLIENT_SECRET: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
  PAYPAL_WEBHOOK_ID: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
  PLATFORM_PAYPAL_EMAIL: z.preprocess(unsetIfEmpty, z.email().optional()),

  // Service tokens. Web BFF sends the admin token; the worker sends the internal token.
  GATEWAY_ADMIN_TOKEN: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
  GATEWAY_INTERNAL_TOKEN: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
