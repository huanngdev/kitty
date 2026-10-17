import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { Hono } from "hono";
import { handleError } from "../../src/app";
import {
  type AppEnv,
  createRequireVerifiedEmail,
  requireSession,
} from "../../src/middleware/session";
import { fakeSession, makeTestUser } from "../support/session";

function buildApp(input: { signedIn: boolean; verified: boolean; enabled: boolean }) {
  const app = new Hono<AppEnv>()
    .onError(handleError)
    .use(
      "*",
      fakeSession(input.signedIn ? makeTestUser({ emailVerified: input.verified }) : null),
      requireSession,
      createRequireVerifiedEmail(input.enabled),
    );

  return app.get("/protected", (c) => c.json({ ok: true }));
}

describe("requireSession", () => {
  test("401 UNAUTHENTICATED without a session", async () => {
    const response = await buildApp({ signedIn: false, verified: false, enabled: true }).request(
      "/protected",
    );
    const parsed = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(401);
    expect(parsed.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("requireVerifiedEmail", () => {
  test("is a no-op when this deployment does not require verification", async () => {
    const response = await buildApp({
      signedIn: true,
      verified: false,
      enabled: false,
    }).request("/protected");

    expect(response.status).toBe(200);
  });

  test("403 EMAIL_NOT_VERIFIED when verification is required and missing", async () => {
    const response = await buildApp({
      signedIn: true,
      verified: false,
      enabled: true,
    }).request("/protected");
    const parsed = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(403);
    expect(parsed.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  test("passes a verified user", async () => {
    const response = await buildApp({
      signedIn: true,
      verified: true,
      enabled: true,
    }).request("/protected");

    expect(response.status).toBe(200);
  });
});
