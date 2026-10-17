import { errorCodes } from "@kitty/shared";
import type { MiddlewareHandler } from "hono";
import { env } from "../env";
import { constantTimeEqual, hmacSha256Hex } from "../lib/crypto";
import { AppError } from "../lib/errors";

/**
 * Admin auth for the Gateway Admin API (docs/10-api-spec.md §1).
 *
 * Every `/v1` request must carry:
 *
 * - `Authorization: Bearer <GATEWAY_ADMIN_TOKEN>` (constant-time compare)
 * - `X-Kitty-User: <userId>` — the organizer on whose behalf the web BFF calls
 * - `X-Kitty-Timestamp: <unix seconds>` — within ±60 s of the gateway clock
 * - `X-Kitty-Signature: <hex>` — `HMAC-SHA256(key = GATEWAY_ADMIN_TOKEN,
 *    message = userId + "\n" + timestamp + "\n" + rawBody)`
 *
 * The middleware only authenticates and sets `c.var.userId`; per-kitty ownership
 * is enforced in the services (the user must own the kitty → 403 FORBIDDEN).
 */

export const ADMIN_AUTH_HEADERS = {
  authorization: "Authorization",
  user: "X-Kitty-User",
  timestamp: "X-Kitty-Timestamp",
  signature: "X-Kitty-Signature",
} as const;

/** Maximum allowed clock skew for `X-Kitty-Timestamp`, in seconds. */
export const ADMIN_CLOCK_SKEW_SECONDS = 60;

/** Hono env of every `/v1` route: the authenticated organizer user id. */
export interface AdminEnv {
  Variables: {
    userId: string;
  };
}

/** The exact string that is HMAC-signed for an admin request. */
export function adminSignatureMessage(userId: string, timestamp: string, rawBody: string): string {
  return `${userId}\n${timestamp}\n${rawBody}`;
}

export interface SignAdminRequestInput {
  readonly token: string;
  readonly userId: string;
  /** Raw request body exactly as it will be sent; `""` for GET/HEAD. */
  readonly body?: string;
  /** Unix epoch **seconds**; defaults to now. */
  readonly timestamp?: number;
}

/**
 * Test/dev client helper that produces the admin auth headers for a request.
 *
 * The web BFF re-implements this on the Node side later; the gateway keeps its
 * own copy so secrets (`GATEWAY_ADMIN_TOKEN`) never leave the service
 * (AGENTS.md invariant #1).
 */
export async function signAdminRequest(
  input: SignAdminRequestInput,
): Promise<Record<string, string>> {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const rawBody = input.body ?? "";
  const signature = await hmacSha256Hex(
    input.token,
    adminSignatureMessage(input.userId, timestamp, rawBody),
  );

  return {
    [ADMIN_AUTH_HEADERS.authorization]: `Bearer ${input.token}`,
    [ADMIN_AUTH_HEADERS.user]: input.userId,
    [ADMIN_AUTH_HEADERS.timestamp]: timestamp,
    [ADMIN_AUTH_HEADERS.signature]: signature,
  };
}

function unauthorized(reason: string, details?: Record<string, unknown>): AppError {
  return new AppError(errorCodes.unauthorized, 401, { reason, ...details });
}

/**
 * Builds the auth middleware around a token getter so tests can inject a token
 * without a real env (the app uses {@link adminAuth}).
 */
export function createAdminAuth(getToken: () => string | undefined): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    const token = getToken();

    if (token === undefined) {
      throw unauthorized("gateway admin token is not configured");
    }

    const bearerPrefix = "Bearer ";
    const authorization = c.req.header(ADMIN_AUTH_HEADERS.authorization) ?? "";

    if (
      !authorization.startsWith(bearerPrefix) ||
      !constantTimeEqual(authorization.slice(bearerPrefix.length), token)
    ) {
      throw unauthorized("invalid admin token");
    }

    const userId = c.req.header(ADMIN_AUTH_HEADERS.user);
    const timestamp = c.req.header(ADMIN_AUTH_HEADERS.timestamp);
    const signature = c.req.header(ADMIN_AUTH_HEADERS.signature);

    if (userId === undefined || timestamp === undefined || signature === undefined) {
      throw unauthorized("missing admin signature headers");
    }

    if (userId.length === 0) {
      throw unauthorized("missing admin signature headers");
    }

    const timestampSeconds = Number(timestamp);

    if (!Number.isInteger(timestampSeconds)) {
      throw unauthorized("invalid timestamp");
    }

    const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);

    if (skewSeconds > ADMIN_CLOCK_SKEW_SECONDS) {
      throw unauthorized("stale timestamp", { skewSeconds });
    }

    // Reads (and caches) the raw body so the signature covers exactly what was
    // sent; `@hono/zod-validator` re-reads the same cached body afterwards.
    const rawBody = await c.req.text();
    const expected = await hmacSha256Hex(token, adminSignatureMessage(userId, timestamp, rawBody));

    if (!constantTimeEqual(expected, signature.toLowerCase())) {
      throw unauthorized("invalid signature");
    }

    c.set("userId", userId);

    await next();
  };
}

/** The middleware the app mounts; reads `GATEWAY_ADMIN_TOKEN` at request time. */
export const adminAuth: MiddlewareHandler<AdminEnv> = createAdminAuth(
  () => env.GATEWAY_ADMIN_TOKEN,
);
