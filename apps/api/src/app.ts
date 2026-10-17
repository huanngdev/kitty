import { healthResponseSchema } from "@kitty/shared/health";
import { Hono, type Context } from "hono";
import { getAuth } from "./lib/auth";
import { AppError } from "./lib/errors";
import { logger } from "./lib/logger";
import { type AppEnv, requireSession, sessionMiddleware } from "./middleware/session";
import { demoRoutes } from "./modules/auth/demo.routes";
import { budgetLinesRoutes } from "./modules/budget-lines/budget-lines.routes";
import { eventsRoutes } from "./modules/events/events.routes";
import { membersRoutes } from "./modules/members/members.routes";
import { systemRoutes } from "./modules/system/system.routes";
import { vendorsRoutes } from "./modules/vendors/vendors.routes";

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

export const app = new Hono();

app.onError(handleError);

// Root health check for platform probes (Render, docker, CI).
app.get("/health", (c) => {
  return c.json(healthResponseSchema.parse({ ok: true }));
});

// Better Auth owns everything under /api/auth.
app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));

// Product API. Reached same-origin from the browser through the Next /api proxy.
app.route("/api", demoRoutes);
app.route("/api", systemRoutes);

/**
 * Session-guarded product API (docs/10-api-spec.md §4). Every route under
 * `/api/events` requires a Better Auth session; `requireSession` turns a signed
 * out request into `401 UNAUTHORIZED` before a handler runs. Authorization
 * (the session user is the event's organizer) lives in the services.
 */
const productRoutes = new Hono<AppEnv>()
  .use("*", sessionMiddleware, requireSession)
  .route("/events", eventsRoutes)
  .route("/events", membersRoutes)
  .route("/events", vendorsRoutes)
  .route("/events", budgetLinesRoutes);

app.route("/api", productRoutes);

export type App = typeof app;
