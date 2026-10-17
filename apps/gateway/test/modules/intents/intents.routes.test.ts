import { describe, expect, test } from "bun:test";
import { errorCodes } from "@kitty/shared";
import { Hono } from "hono";
import { AppError } from "../../../src/lib/errors";
import { createInternalAuth } from "../../../src/modules/intents/internal-auth";

function buildApp(expected: string | undefined): Hono {
  return new Hono()
    .use(
      "*",
      createInternalAuth(() => expected),
    )
    .onError((error, c) => {
      if (error instanceof AppError) {
        return c.json({ error: { code: error.code } }, error.httpStatus);
      }
      return c.json({ error: { code: "INTERNAL" } }, 500);
    })
    .get("/probe", (c) => c.json({ ok: true }));
}

describe("createInternalAuth", () => {
  test("rejects a missing or wrong bearer token", async () => {
    const app = buildApp("secret");
    const missing = await app.request("/probe");
    const wrong = await app.request("/probe", { headers: { authorization: "Bearer nope" } });

    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: { code: errorCodes.unauthorized } });
    expect(wrong.status).toBe(401);
  });

  test("accepts the configured token", async () => {
    const app = buildApp("secret");
    const response = await app.request("/probe", {
      headers: { authorization: "Bearer secret" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("fails closed when no token is configured", async () => {
    const app = buildApp(undefined);
    const response = await app.request("/probe", { headers: { authorization: "Bearer anything" } });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "INTERNAL_TOKEN_NOT_CONFIGURED" } });
  });
});
