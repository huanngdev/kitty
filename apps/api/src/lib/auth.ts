import { account, session, user, verification } from "@kitty/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "../env";
import { getDb } from "./db";
import { AppError } from "./errors";

function createAuth() {
  const {
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: baseURL,
    WEB_ORIGIN: webOrigin,
  } = env;

  if (
    databaseUrl === undefined ||
    secret === undefined ||
    baseURL === undefined ||
    webOrigin === undefined
  ) {
    const missing: string[] = [];
    if (databaseUrl === undefined) missing.push("DATABASE_URL");
    if (secret === undefined) missing.push("BETTER_AUTH_SECRET");
    if (baseURL === undefined) missing.push("BETTER_AUTH_URL");
    if (webOrigin === undefined) missing.push("WEB_ORIGIN");

    // Names only — never the values (AGENTS.md invariant #11).
    throw new AppError("AUTH_NOT_CONFIGURED", 503, { missing });
  }

  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    secret,
    baseURL,
    basePath: "/api/auth",
    trustedOrigins: [webOrigin],
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        /**
         * Demo/judge flag. Not part of sign-up input — only the demo seed sets it
         * via the database (AGENTS.md invariant #13: demo key is the sole exception
         * to BYOK, and only for flagged accounts).
         */
        isDemo: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      // Secure cookies over HTTPS in production; the dev server is plain http.
      useSecureCookies: env.NODE_ENV === "production",
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Shape Better Auth returns from `getSession`. */
export type AuthSession = Auth["$Infer"]["Session"];

let auth: Auth | undefined;

/**
 * Lazily builds the Better Auth instance. Throws `AUTH_NOT_CONFIGURED` (503)
 * listing the missing env var names when the service is not configured yet, so
 * the app still boots without auth.
 */
export function getAuth(): Auth {
  auth ??= createAuth();

  return auth;
}
