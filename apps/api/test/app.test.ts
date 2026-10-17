import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { healthResponseSchema } from "@kitty/shared/health";
import { Hono } from "hono";
import { z } from "zod";
import { app, handleError } from "../src/app";
import { AppError } from "../src/lib/errors";

describe("GET /health", () => {
  test("returns a valid health response", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ ok: true });
  });
});

describe("GET /api/health", () => {
  test("returns a valid health response under the product API prefix", async () => {
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ ok: true });
  });
});

// NOTE: `bun run test` runs `bun test --no-env-file`, so a developer's local
// `apps/api/.env` is never loaded. This suite therefore exercises the
// "auth not configured" branch deterministically (see apps/gateway too).
describe("GET /api/auth/ok", () => {
  test("returns the shared error shape when auth is not configured", async () => {
    const response = await app.request("/api/auth/ok");

    expect(response.status).toBe(503);

    const parsed = apiErrorSchema.parse(await response.json());
    expect(parsed.error.code).toBe("AUTH_NOT_CONFIGURED");

    const details = z.object({ missing: z.array(z.string()) }).parse(parsed.error.details);
    expect(details.missing).toContain("BETTER_AUTH_SECRET");
    expect(details.missing.length).toBeGreaterThan(0);
  });
});

describe("handleError", () => {
  test("maps AppError to the shared error shape", async () => {
    const testApp = new Hono().onError(handleError).get("/boom", () => {
      throw new AppError("BOOM", 418, { reason: "teapot" });
    });

    const response = await testApp.request("/boom");

    expect(response.status).toBe(418);

    const parsed = apiErrorSchema.parse(await response.json());
    expect(parsed.error).toEqual({ code: "BOOM", message: "BOOM", details: { reason: "teapot" } });
  });

  test("maps unknown errors to a bare 500 without leaking details", async () => {
    const testApp = new Hono().onError(handleError).get("/kaboom", () => {
      throw new Error("super-secret-internal-detail");
    });

    const response = await testApp.request("/kaboom");
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain("super-secret-internal-detail");
    expect(apiErrorSchema.parse(JSON.parse(body)).error.code).toBe("INTERNAL");
  });
});
