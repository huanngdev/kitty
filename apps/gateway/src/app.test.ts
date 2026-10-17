import { describe, expect, test } from "bun:test";
import { healthResponseSchema } from "@kitty/shared/health";
import { app } from "./app";

describe("GET /health", () => {
  test("returns a valid health response", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ ok: true });
  });
});
