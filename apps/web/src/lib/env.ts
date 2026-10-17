import { z } from "zod";

/**
 * Env for the Kitty web app (`apps/web`).
 *
 * Validated at import time. Server and client variables are kept apart because
 * Next.js only inlines `NEXT_PUBLIC_*` values into the browser bundle: the
 * client schema must never reference a server-only variable.
 *
 * See `apps/web/.env.example` and `docs/08-infrastructure.md`.
 */
const serverSchema = z.object({
  // Internal URL of apps/api, used by the Next rewrite proxy (/api -> apps/api).
  API_URL: z.url().default("http://localhost:8787"),
});

const clientSchema = z.object({
  // Public URL of this app.
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  // PayPal JS SDK client id (public). Optional until checkout is wired.
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

const isServer = typeof window === "undefined";

/** Env safe to read in the browser. */
export const clientEnv: ClientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
});

/**
 * Server-only env. Throws when called in the browser, so it is safe to use from
 * server modules such as `next.config.ts`.
 */
export function getServerEnv(): ServerEnv {
  if (!isServer) {
    throw new Error("getServerEnv() must only be called on the server");
  }

  return serverSchema.parse(process.env);
}
