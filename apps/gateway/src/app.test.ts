import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { healthResponseSchema } from "@kitty/shared/health";
import { Hono } from "hono";
import { app, handleError } from "./app";
import { AppError } from "./lib/errors";

describe("GET /health", () => {
  test("returns a valid health response", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ ok: true });
  });
});

describe("handleError", () => {
  test("maps AppError to the shared error shape", async () => {
    const testApp = new Hono().onError(handleError).get("/boom", () => {
      throw new AppError("BOOM", 400, { reason: "test" });
    });

    const response = await testApp.request("/boom");

    expect(response.status).toBe(400);

    const parsed = apiErrorSchema.parse(await response.json());
    expect(parsed.error.code).toBe("BOOM");
  });

  test("maps unknown errors to a bare 500", async () => {
    const testApp = new Hono().onError(handleError).get("/kaboom", () => {
      throw new Error("internal detail");
    });

    const response = await testApp.request("/kaboom");

    expect(response.status).toBe(500);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("INTERNAL");
  });
});
