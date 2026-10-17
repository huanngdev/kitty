import { healthResponseSchema } from "@kitty/shared/health";
import { Hono, type Context } from "hono";
import { AppError } from "./lib/errors";
import { logger } from "./lib/logger";

/**
 * The single Hono error handler (CODE_RULES.md §D): `AppError` becomes the shared
 * `{ error: { code, message, details } }` shape, anything else is a bare 500 with
 * no stack trace leaked.
 */
export function handleError(error: Error, c: Context): Response {
  if (error instanceof AppError) {
    return c.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.httpStatus,
    );
  }

  logger.error({ err: error }, "unhandled error");

  return c.json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
}

/**
 * Leash Gateway.
 *
 * This is the ONLY service allowed to hold PayPal secrets (AGENTS.md invariant
 * #1). The money path (`verify -> policy -> reserve -> step-up -> PayPal`) lands
 * in later tasks; for now this is a health-checkable skeleton with no business
 * logic.
 */
export const app = new Hono();

app.onError(handleError);

app.get("/health", (c) => {
  return c.json(healthResponseSchema.parse({ ok: true }));
});

export type GatewayApp = typeof app;
