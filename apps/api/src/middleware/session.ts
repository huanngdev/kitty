import { errorCodes } from "@kitty/shared";
import type { Context, MiddlewareHandler } from "hono";
import { shouldRequireEmailVerification } from "../lib/auth-config";
import type { AuthSession } from "../lib/auth";
import { getAuth } from "../lib/auth";
import { AppError } from "../lib/errors";
import { env } from "../env";
import type { EventRow } from "@kitty/db";

export interface AppVariables {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
  /** Set by `requireEventOrganizer` once the event is known to belong to `user`. */
  event: EventRow | null;
}

export type AppEnv = { Variables: AppVariables };

/**
 * Loads the Better Auth session and exposes typed `c.var.user` / `c.var.session`
 * (both `null` when signed out). Not mounted globally yet — later features opt in
 * per route so the API keeps working without a database.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  let session: AuthSession | null = null;

  try {
    session = await getAuth().api.getSession({ headers: c.req.raw.headers });
  } catch (error) {
    // An unconfigured auth backend is treated as "signed out"; anything else is real.
    if (!(error instanceof AppError) || error.code !== "AUTH_NOT_CONFIGURED") {
      throw error;
    }
  }

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);

  await next();
};

/**
 * Rejects a request with no session: `401 UNAUTHENTICATED`. Mount it right
 * after {@link sessionMiddleware} on every route that needs a signed-in user.
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user") === null) {
    throw new AppError(errorCodes.unauthenticated, 401, { reason: "sign in required" });
  }

  await next();
};

/**
 * Rejects a signed-in user whose email is not verified with
 * `403 EMAIL_NOT_VERIFIED`.
 *
 * Only active when this deployment requires verification (ADR-029): in
 * development, where verification is off, there is nothing to enforce and
 * mounting it anyway would lock every local account out.
 */
export function createRequireVerifiedEmail(enabled: boolean): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!enabled) {
      await next();
      return;
    }

    const user = c.get("user");

    if (user === null) {
      throw new AppError(errorCodes.unauthenticated, 401, { reason: "sign in required" });
    }

    if (user.emailVerified !== true) {
      throw new AppError(errorCodes.emailNotVerified, 403, {
        reason: "verify your email to continue",
      });
    }

    await next();
  };
}

/** The mounted version, driven by this deployment's verification policy. */
export const requireVerifiedEmail: MiddlewareHandler<AppEnv> = createRequireVerifiedEmail(
  shouldRequireEmailVerification(env),
);

/** The authenticated user, or `401 UNAUTHENTICATED` (handlers run after `requireSession`). */
export function requireUser(c: Context<AppEnv>): AuthSession["user"] {
  const user = c.get("user");

  if (user === null) {
    throw new AppError(errorCodes.unauthenticated, 401, { reason: "sign in required" });
  }

  return user;
}
