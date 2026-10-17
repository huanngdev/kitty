import { errorCodes } from "@kitty/shared";
import type { Context, MiddlewareHandler } from "hono";
import type { AuthSession } from "../lib/auth";
import { getAuth } from "../lib/auth";
import { AppError } from "../lib/errors";

export interface AppVariables {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
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
 * Rejects a request with no session with `401 UNAUTHORIZED`. Mount it right
 * after {@link sessionMiddleware} on every route that needs an organizer.
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user") === null) {
    throw new AppError(errorCodes.unauthorized, 401, { reason: "sign in required" });
  }

  await next();
};

/** The authenticated user, or `401 UNAUTHORIZED` (handlers run after `requireSession`). */
export function requireUser(c: Context<AppEnv>): AuthSession["user"] {
  const user = c.get("user");

  if (user === null) {
    throw new AppError(errorCodes.unauthorized, 401, { reason: "sign in required" });
  }

  return user;
}
