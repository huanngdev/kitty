import type { Db } from "@kitty/db";
import { account, rateLimit, session, user, verification } from "@kitty/db/schema";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import {
  APIError,
  type AuthMiddleware,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { env } from "../env";
import {
  buildSocialProviders,
  isPasswordResetAvailable,
  shouldRequireEmailVerification,
} from "./auth-config";
import { isDemoBlockedPath, resolveGuardAction } from "./auth-guard";
import { buildPasswordResetEmail, buildVerificationEmail } from "./auth-emails";
import { getDb } from "./db";
import { AppError } from "./errors";
import { type Mailer, type SelectedMailer, selectMailer } from "./mailer";

/**
 * Better Auth's answer for a reset request, whether or not the address exists.
 * The demo no-op and the "no mailer in production" case return exactly this, so
 * a caller cannot tell the difference (no enumeration, docs/14).
 */
const GENERIC_RESET_RESPONSE = {
  status: true,
  message: "If this email exists in our system, check your email for the reset link",
} as const;

interface GuardContext {
  /** Parsed request body, when Better Auth already validated it. */
  readonly body?: unknown;
  readonly request?: Request | undefined;
}

function emailFromBody(body: unknown): string | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof body.email === "string"
  ) {
    return body.email.trim().toLowerCase();
  }

  return null;
}

/**
 * Reads `email` from the request body. Better Auth usually hands the parsed
 * body to the hook context; the `Request` clone is a fallback so the guard still
 * works if the body is only on the wire. Neither path consumes the real stream.
 */
async function readEmail(ctx: GuardContext): Promise<string | null> {
  const parsed = emailFromBody(ctx.body);

  if (parsed !== null) {
    return parsed;
  }

  if (ctx.request === undefined) {
    return null;
  }

  try {
    return emailFromBody(await ctx.request.clone().json());
  } catch {
    // Unparseable body: let Better Auth answer with its own validation error.
    return null;
  }
}

/**
 * The `hooks.before` guard (ADR-029):
 *
 * - demo (`is_demo`) accounts are read-only → `403 DEMO_READ_ONLY`;
 * - a reset request for a demo address, or any reset request on a deployment
 *   that cannot send mail, silently answers with the generic success and sends
 *   nothing. The database lookup happens **only** for the two reset paths.
 *
 * The demo lookup is injected so the guard is unit-testable without a database.
 */
export function createAuthGuardHooks(input: {
  readonly passwordResetEnabled: boolean;
  readonly isDemoEmail: (email: string) => Promise<boolean>;
}): AuthMiddleware {
  return createAuthMiddleware(async (ctx) => {
    const path = ctx.path ?? "";

    const email =
      path === "/request-password-reset" || path === "/forget-password"
        ? await readEmail(ctx)
        : null;
    const emailIsDemo = email === null ? null : await input.isDemoEmail(email);
    // Only the demo-blocked paths need the session: resolving it for every auth
    // request would add a lookup the endpoint is about to do anyway.
    const current = isDemoBlockedPath(path) ? await getSessionFromCtx(ctx) : null;
    const action = resolveGuardAction({
      path,
      passwordResetAvailable: input.passwordResetEnabled,
      sessionIsDemo: current === null ? null : current.user.isDemo === true,
      emailIsDemo,
    });

    switch (action.type) {
      case "silent_reset_success":
        return ctx.json(GENERIC_RESET_RESPONSE);
      case "demo_read_only":
        throw new APIError("FORBIDDEN", {
          code: "DEMO_READ_ONLY",
          message: "Demo accounts cannot change credentials or be deleted.",
        });
      case "allow":
        return;
      default: {
        const exhaustiveness: never = action;

        return exhaustiveness;
      }
    }
  });
}

export interface CreateAuthOptions {
  /** Env to read. Defaults to the process env; tests pass fixtures. */
  readonly env?: Env;
  /** Database client override for tests. */
  readonly db?: Db;
  /** Mailer override for tests. */
  readonly mailer?: SelectedMailer;
  /** Extra plugins (test-only OAuth mock, future auth plugins). */
  readonly plugins?: BetterAuthPlugin[];
  /** Override the trusted social providers (tests only). */
  readonly trustedProviders?: readonly string[];
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

  const selectedMailer: SelectedMailer = options.mailer ?? selectMailer(authEnv);
  const mailer: Mailer = selectedMailer.mailer;
  const requireEmailVerification = shouldRequireEmailVerification(authEnv);
  const passwordResetEnabled = isPasswordResetAvailable(authEnv);
  const db: Db = options.db ?? getDb();
  const database = drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, rateLimit },
  });

  /**
   * Demo lookup for the guard. Goes through our own Drizzle client (not
   * Better Auth's adapter) because `is_demo` is a Kitty additional field.
   */
  const isDemoEmail = async (email: string): Promise<boolean> => {
    const [row] = await db
      .select({ isDemo: user.isDemo })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    return row?.isDemo === true;
  };

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
      /**
       * `shouldRequireEmailVerification` already refuses to require verification
       * on a deployment that cannot deliver the link (ADR-029); requiring it
       * anyway would lock every new account out.
       */
      requireEmailVerification,
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
        trustedProviders: [...(options.trustedProviders ?? ["github", "paypal"])],
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
      before: createAuthGuardHooks({ passwordResetEnabled, isDemoEmail }),
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
