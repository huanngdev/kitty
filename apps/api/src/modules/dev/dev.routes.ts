import { Hono } from "hono";
import { env } from "../../env";
import { AppError } from "../../lib/errors";
import { consoleMailerSingleton } from "../../lib/mailer";

/**
 * Development-only test surface (ADR-029).
 *
 * The console mailer keeps the links it "sent", and the Playwright/API
 * integration tests read them back through these routes instead of scraping
 * logs. In production (and test) every route here is a plain 404, exactly as if
 * it did not exist.
 */
export function createDevRoutes(): Hono {
  return new Hono()
    .get("/dev/last-email", (c) => {
      if (env.NODE_ENV !== "development") {
        throw new AppError("DEV_ROUTES_DISABLED", 404);
      }

      const to = c.req.query("to");

      if (to === undefined || to.length === 0) {
        throw new AppError("BAD_REQUEST", 400, { reason: "?to= is required" });
      }

      return c.json({ email: consoleMailerSingleton().lastFor(to) ?? null });
    })
    .post("/dev/emails/clear", (c) => {
      if (env.NODE_ENV !== "development") {
        throw new AppError("DEV_ROUTES_DISABLED", 404);
      }

      consoleMailerSingleton().clear();

      return c.json({ ok: true });
    });
}

export const devRoutes = createDevRoutes();
