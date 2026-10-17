import type { Db } from "@kitty/db";
import { account, rateLimit, session, user, verification } from "@kitty/db/schema";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../env";
import { env } from "../env";
import { buildSocialProviders, shouldRequireEmailVerification } from "./auth-config";
import { buildPasswordResetEmail, buildVerificationEmail } from "./auth-emails";
import { getDb } from "./db";
import { AppError } from "./errors";
import { type Mailer, type SelectedMailer, selectMailer } from "./mailer";

/** Sensitive Better Auth endpoints a demo (`is_demo`) account may never call. */
const DEMO_BLOCKED_PATHS = new Set([
  "/change-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/unlink-account",
]);

/**
 * Endpoint hook: demo accounts are read-only (ADR-029). The hook runs before
 * Better Auth resolves the endpoint, so it needs the session itself — cheaper
 * than resolving a session for every request, and it only runs for auth paths.
 */
const demoReadOnlyGuard = createAuthMiddleware(async (ctx) => {
  const path = ctx.path ?? "";

  if (!DEMO_BLOCKED_PATHS.has(path)) {
    return;
  }

  const current = await getSessionFromCtx(ctx);

  if (current?.user.isDemo !== true) {
    return;
  }

  throw new APIError("FORBIDDEN", {
    code: "DEMO_READ_ONLY",
    message: "Demo accounts cannot change credentials or be deleted.",
  });
});

export interface CreateAuthOptions {
  /** Env to read. Defaults to the process env; tests pass fixtures. */
  readonly env?: Env;
  /** Database client override for tests. */
  readonly db?: Db;
  /** Mailer override for tests. */
  readonly mailer?: SelectedMailer;
  /** Extra plugins (test-only OAuth mock, future auth plugins). */
  readonly plugins?: BetterAuthPlugin[];
}

function createAuth(options: CreateAuthOptions = {}) {
  const authEnv = options.env ?? env;
  const {
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: baseURL,
    WEB_ORIGIN: webOrigin,
  } = authEnv;

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

  const mailer: Mailer = (options.mailer ?? selectMailer(authEnv)).mailer;
  const requireEmailVerification = shouldRequireEmailVerification(authEnv);
  const database =
    options.db === undefined
      ? drizzleAdapter(getDb(), {
          provider: "pg",
          schema: { user, session, account, verification, rateLimit },
        })
      : drizzleAdapter(options.db, {
          provider: "pg",
          schema: { user, session, account, verification, rateLimit },
        });

  /**
   * Verification is honoured only when the deployment can actually deliver the
   * link (ADR-029). `requireEmailVerification` behind `sendVerificationEmail`
   * would otherwise lock every new account out.
   */
  const canSendEmail = mailer.kind === "resend" || mailer.kind === "console";

  return betterAuth({
    appName: "Kitty",
    database,
    secret,
    baseURL,
    basePath: "/api/auth",
    trustedOrigins: [webOrigin],
    emailAndPassword: {
      enabled: true,
      // min/max mirror @kitty/shared authPasswordSchema so the browser and the
      // server reject exactly the same values.
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: requireEmailVerification && canSendEmail,
      resetPasswordTokenExpiresIn: 60 * 60,
      // A reset must lock everybody else out (docs/14: stolen-password recovery).
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: target, token }) => {
        await mailer.send({
          to: target.email,
          ...buildPasswordResetEmail({
            name: target.name,
            url: `${webOrigin}/reset-password?token=${encodeURIComponent(token)}`,
          }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 60 * 60 * 24,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: target, token }) => {
        await mailer.send({
          to: target.email,
          ...buildVerificationEmail({
            name: target.name,
            url: `${webOrigin}/verify-email?token=${encodeURIComponent(token)}`,
          }),
        });
      },
    },
    socialProviders: buildSocialProviders(authEnv),
    account: {
      accountLinking: {
        enabled: true,
        // Trust only Kitty's two providers, and still require the provider to
        // assert a verified email before an implicit link (see validateUserInfo
        // and ADR-029). Better Auth additionally requires the local account's
        // email to be verified (its `requireLocalEmailVerified` default).
        trustedProviders: ["github", "paypal"],
        allowDifferentEmails: false,
      },
    },
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
      changeEmail: { enabled: false },
      deleteUser: { enabled: true },
      /**
       * Account-takeover guard (docs/14): an implicit link into an existing
       * account is allowed only when the provider itself says the email is
       * verified. GitHub's primary email and PayPal's `email_verified` both
       * arrive here; an unverified one aborts the OAuth flow and the user is
       * told to sign in with their password and link from Settings.
       */
      validateUserInfo: ({ user: candidateInfo, source }, ctx) => {
        if (source.action !== "link-account") {
          return;
        }

        if (candidateInfo.emailVerified === true) {
          return;
        }

        ctx.context.logger.warn("rejected implicit account link: provider email not verified");

        return {
          error: "provider_email_not_verified",
          errorDescription:
            "That provider email isn't verified. Sign in with your email and password, then link the provider from Settings.",
        };
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Change password, unlink a provider and delete the account require a
      // session fresher than this (Better Auth's freshSessionMiddleware). One
      // day matches the session refresh interval, so a normal visit is fresh
      // while a days-old tab is forced to sign in again.
      freshAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/forget-password": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    advanced: {
      // Secure cookies over HTTPS in production; the dev server is plain http.
      useSecureCookies: authEnv.NODE_ENV === "production",
      cookiePrefix: "kitty",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (createdUser) => ({
            data: {
              ...createdUser,
              name: createdUser.name.trim(),
              email: createdUser.email.trim().toLowerCase(),
            },
          }),
        },
      },
    },
    hooks: {
      before: demoReadOnlyGuard,
    },
    plugins: options.plugins ?? [],
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

export { createAuth };
