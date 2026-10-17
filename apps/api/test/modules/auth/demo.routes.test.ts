import { apiErrorSchema } from "@kitty/shared";
import { demoLoginStatusSchema } from "@kitty/shared/auth";
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { handleError } from "../../../src/app";
import { AppError } from "../../../src/lib/errors";
import { createFixedWindowRateLimiter } from "../../../src/lib/fixed-window-rate-limit";
import { createDemoRoutes, DEMO_LOGIN_RATE_LIMIT } from "../../../src/modules/auth/demo.routes";

interface MakeAppOptions {
  enabled: boolean;
  /** Fake Better Auth response; the real service needs a database. */
  signIn?: (headers: Headers) => Promise<Response>;
  limit?: number;
}

function fakeSignIn(): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ token: "fake-session" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": "better-auth.session_token=fake; Path=/; HttpOnly",
      },
    }),
  );
}

function makeApp(options: MakeAppOptions): Hono {
  const limiter = createFixedWindowRateLimiter({
    limit: options.limit ?? DEMO_LOGIN_RATE_LIMIT.limit,
    windowMs: DEMO_LOGIN_RATE_LIMIT.windowMs,
  });

  const routes = createDemoRoutes({
    isEnabled: () => options.enabled,
    signIn: options.signIn ?? fakeSignIn,
    limiter,
  });

  return new Hono().onError(handleError).route("/api", routes);
}

describe("GET /api/demo-sign-in/status", () => {
  test("reports demo login as disabled by default", async () => {
    const response = await makeApp({ enabled: false }).request("/api/demo-sign-in/status");

    expect(response.status).toBe(200);
    expect(demoLoginStatusSchema.parse(await response.json())).toEqual({ enabled: false });
  });

  test("reports demo login as enabled when the deployment opts in", async () => {
    const response = await makeApp({ enabled: true }).request("/api/demo-sign-in/status");

    expect(response.status).toBe(200);
    expect(demoLoginStatusSchema.parse(await response.json())).toEqual({ enabled: true });
  });

  test("is not rate limited", async () => {
    const app = makeApp({ enabled: true, limit: 1 });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.request("/api/demo-sign-in/status");

      expect(response.status).toBe(200);
    }
  });
});

describe("POST /api/demo-sign-in", () => {
  test("is a 404 with the shared error shape when demo login is off", async () => {
    let signInCalled = false;

    const app = makeApp({
      enabled: false,
      signIn: () => {
        signInCalled = true;

        return fakeSignIn();
      },
    });

    const response = await app.request("/api/demo-sign-in", { method: "POST" });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("DEMO_LOGIN_DISABLED");
    expect(signInCalled).toBe(false);
  });

  test("signs in when enabled and forwards Set-Cookie", async () => {
    const app = makeApp({ enabled: true });

    const response = await app.request("/api/demo-sign-in", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token=fake");
    expect(await response.json()).toEqual({ token: "fake-session" });
  });

  test("returns 429 RATE_LIMITED after the per-IP window is exhausted", async () => {
    const app = makeApp({ enabled: true, limit: 2 });
    const headers = { "x-forwarded-for": "203.0.113.7" };

    expect((await app.request("/api/demo-sign-in", { method: "POST", headers })).status).toBe(200);
    expect((await app.request("/api/demo-sign-in", { method: "POST", headers })).status).toBe(200);

    const blocked = await app.request("/api/demo-sign-in", { method: "POST", headers });

    expect(blocked.status).toBe(429);

    const parsed = apiErrorSchema.parse(await blocked.json());
    expect(parsed.error.code).toBe("RATE_LIMITED");

    const details = z
      .object({ retryAfterSeconds: z.number().int().positive() })
      .parse(parsed.error.details);
    expect(details.retryAfterSeconds).toBeGreaterThan(0);

    // A different client IP keeps its own window.
    const other = await app.request("/api/demo-sign-in", {
      method: "POST",
      headers: { "x-forwarded-for": "198.51.100.9" },
    });

    expect(other.status).toBe(200);
  });

  test("propagates a service failure through the shared error shape", async () => {
    const app = makeApp({
      enabled: true,
      signIn: () => {
        throw new AppError("DEMO_LOGIN_FAILED", 401, { hint: "seed the demo account" });
      },
    });

    const response = await app.request("/api/demo-sign-in", { method: "POST" });

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("DEMO_LOGIN_FAILED");
  });
});
