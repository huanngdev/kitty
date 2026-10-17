import { z } from "zod";

/** Treat empty strings (for example `DATABASE_URL=` in a local `.env`) as unset. */
const unsetIfEmpty = (value: unknown): unknown => (value === "" ? undefined : value);

/**
 * Env for the Kitty service API (`apps/api`).
 *
 * Validated at import time so a misconfigured service fails on startup instead
 * of at the first request. Variables that the service does not use yet are
 * optional, so the skeleton (and its tests) run without a full `.env`.
 * See `docs/08-infrastructure.md` for where each value comes from.
 */
const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),

  // Neon Postgres pooled connection used by the app. drizzle-kit migrations use
  // DATABASE_URL_UNPOOLED from packages/db/.env (packages/db/drizzle.config.ts).
  DATABASE_URL: z.preprocess(unsetIfEmpty, z.url().optional()),

  // Better Auth (server lives here; clients call it through the web proxy).
  BETTER_AUTH_SECRET: z.preprocess(unsetIfEmpty, z.string().min(32).optional()),
  BETTER_AUTH_URL: z.preprocess(unsetIfEmpty, z.url().optional()),

  // Public origin of the web app, allowed to call this API.
  WEB_ORIGIN: z.preprocess(unsetIfEmpty, z.url().optional()),

  // Leash Gateway Admin API.
  GATEWAY_URL: z.preprocess(unsetIfEmpty, z.url().optional()),
  GATEWAY_ADMIN_TOKEN: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
