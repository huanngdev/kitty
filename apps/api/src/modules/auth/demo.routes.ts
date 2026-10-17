import { demoLoginStatusSchema } from "@kitty/shared/auth";
import { Hono } from "hono";
import { clientIp } from "../../lib/client-ip";
import { AppError } from "../../lib/errors";
import {
  createFixedWindowRateLimiter,
  type FixedWindowRateLimiter,
} from "../../lib/fixed-window-rate-limit";
import { isDemoLoginEnabled, signInAsDemoOrganizer } from "./demo.service";

/** 10 attempts per 10 minutes per client IP (docs/14 threat model: abuse). */
export const DEMO_LOGIN_RATE_LIMIT = {
  limit: 10,
  windowMs: 10 * 60 * 1_000,
} as const;

export interface DemoRoutesDeps {
  isEnabled: () => boolean;
  signIn: (headers: Headers) => Promise<Response>;
  limiter: FixedWindowRateLimiter;
}

/**
 * Demo login endpoints, mounted under `/api` and outside `/api/auth/*` so Better
 * Auth's catch-all handler does not swallow them. The demo password stays on the
 * server (AGENTS.md invariant #11).
 *
 * - `GET  /api/demo-sign-in/status` always answers, so the web app can hide the
 *   button on deployments where demo login is off.
 * - `POST /api/demo-sign-in` is a 404 unless `DEMO_LOGIN_ENABLED=true`, and is
 *   rate limited per client IP.
 */
export function createDemoRoutes(deps: DemoRoutesDeps): Hono {
  return new Hono()
    .get("/demo-sign-in/status", (c) =>
      c.json(demoLoginStatusSchema.parse({ enabled: deps.isEnabled() })),
    )
    .post("/demo-sign-in", async (c) => {
      if (!deps.isEnabled()) {
        // 404, not 403: the endpoint simply does not exist on this deployment.
        throw new AppError("DEMO_LOGIN_DISABLED", 404);
      }

      const decision = deps.limiter.check(clientIp(c.req.raw.headers));

      if (!decision.allowed) {
        throw new AppError("RATE_LIMITED", 429, {
          retryAfterSeconds: decision.retryAfterSeconds,
        });
      }

      const response = await deps.signIn(c.req.raw.headers);

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    });
}

export const demoRoutes = createDemoRoutes({
  isEnabled: isDemoLoginEnabled,
  signIn: signInAsDemoOrganizer,
  limiter: createFixedWindowRateLimiter(DEMO_LOGIN_RATE_LIMIT),
});
