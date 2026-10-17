import { errorCodes } from "@kitty/shared";
import type { MiddlewareHandler } from "hono";
import { env } from "../../env";
import { constantTimeEqual } from "../../lib/crypto";
import { AppError } from "../../lib/errors";

/**
 * Auth for the Gateway Internal API (docs/10-api-spec.md §6).
 *
 * The worker sends `Authorization: Bearer <GATEWAY_INTERNAL_TOKEN>`; the token
 * is compared in constant time (shared helper in `lib/crypto.ts`, the same one
 * the Admin API uses). The middleware is built around a token getter so tests
 * can inject a token without a real environment.
 */

export function createInternalAuth(getToken: () => string | undefined): MiddlewareHandler {
  return async (c, next) => {
    const token = getToken();

    if (token === undefined) {
      throw new AppError("INTERNAL_TOKEN_NOT_CONFIGURED", 503, {
        reason: "gateway internal token is not configured",
      });
    }

    const bearerPrefix = "Bearer ";
    const authorization = c.req.header("Authorization") ?? "";

    if (
      !authorization.startsWith(bearerPrefix) ||
      !constantTimeEqual(authorization.slice(bearerPrefix.length), token)
    ) {
      throw new AppError(errorCodes.unauthorized, 401, { reason: "invalid internal token" });
    }

    await next();
  };
}

/** The middleware the app mounts; reads `GATEWAY_INTERNAL_TOKEN` at request time. */
export const internalAuth: MiddlewareHandler = createInternalAuth(() => env.GATEWAY_INTERNAL_TOKEN);
