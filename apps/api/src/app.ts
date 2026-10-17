import { healthResponseSchema } from "@kitty/shared/health";
import { Hono, type Context } from "hono";
import { getAuth } from "./lib/auth";
import { getDb } from "./lib/db";
import { AppError } from "./lib/errors";
import { logger } from "./lib/logger";
import { createRequireEventOrganizer } from "./middleware/authorization";
import {
  type AppEnv,
  requireSession,
  requireVerifiedEmail,
  sessionMiddleware,
} from "./middleware/session";
import { authConfigRoutes } from "./modules/auth/auth-config.routes";
import { demoRoutes } from "./modules/auth/demo.routes";
import { budgetLinesRoutes } from "./modules/budget-lines/budget-lines.routes";
import { devRoutes } from "./modules/dev/dev.routes";
import { createEventsRepository } from "./modules/events/events.repository";
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
app.route("/api", authConfigRoutes);
app.route("/api", demoRoutes);
app.route("/api", systemRoutes);

// Development-only helpers (last auth email). Every route 404s outside development.
app.route("/api", devRoutes);

/**
 * Event-scoped authorization runs before the product routers (docs/10 §4,
 * ADR-029): a signed-in caller who is not the organizer of the event in the
 * path gets `404 EVENT_NOT_FOUND`, the same answer as an unknown id.
 */
export const requireEventOrganizer = createRequireEventOrganizer({
  events: {
    findById: (id) => createEventsRepository(getDb()).findById(id),
  },
});

/**
 * Session-guarded product API (docs/10-api-spec.md §4). Every route under
 * `/api/events` requires a Better Auth session (`401 UNAUTHENTICATED`), a
 * verified email when this deployment requires one (`403 EMAIL_NOT_VERIFIED`)
 * and organizer ownership of the event in the path (`404 EVENT_NOT_FOUND`).
 */
const productRoutes = new Hono<AppEnv>()
  .use("*", sessionMiddleware, requireSession, requireVerifiedEmail)
  .use("/events/:id", requireEventOrganizer)
  .use("/events/:id/*", requireEventOrganizer)
  .route("/events", eventsRoutes)
  .route("/events", membersRoutes)
  .route("/events", vendorsRoutes)
  .route("/events", budgetLinesRoutes);

app.route("/api", productRoutes);

export type App = typeof app;
