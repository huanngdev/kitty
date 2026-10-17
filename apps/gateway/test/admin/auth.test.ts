import { describe, expect, test } from "bun:test";
import type { KittyRow } from "@kitty/db";
import { apiErrorSchema } from "@kitty/shared";
import { Hono } from "hono";
import { handleError } from "../../src/app";
import { constantTimeEqual } from "../../src/lib/crypto";
import { AppError } from "../../src/lib/errors";
import { assertKittyOwner, requireKitty, requireOwnedKitty } from "../../src/lib/ownership";
import {
  ADMIN_AUTH_HEADERS,
  type AdminEnv,
  adminSignatureMessage,
  createAdminAuth,
  signAdminRequest,
} from "../../src/admin/auth";

const TOKEN = "test-admin-token";
const USER_ID = "user_owner_1";

function buildApp(getToken: () => string | undefined = () => TOKEN): Hono<AdminEnv> {
  const app = new Hono<AdminEnv>().onError(handleError);
  app.use("/v1/*", createAdminAuth(getToken));
  app.get("/v1/whoami", (c) => c.json({ userId: c.get("userId") }));
  app.post("/v1/echo", (c) => c.json({ ok: true }));
  return app;
}

async function errorCode(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error.code;
}

describe("constantTimeEqual", () => {
  test("matches equal strings and rejects different ones", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("signAdminRequest", () => {
  test("produces hex signature header over userId + timestamp + body", async () => {
    const headers = await signAdminRequest({
      token: TOKEN,
      userId: USER_ID,
      body: '{"a":1}',
      timestamp: 1_700_000_000,
    });

    expect(headers[ADMIN_AUTH_HEADERS.authorization]).toBe(`Bearer ${TOKEN}`);
    expect(headers[ADMIN_AUTH_HEADERS.user]).toBe(USER_ID);
    expect(headers[ADMIN_AUTH_HEADERS.timestamp]).toBe("1700000000");
    expect(headers[ADMIN_AUTH_HEADERS.signature]).toMatch(/^[0-9a-f]{64}$/);
  });

  // Known-answer vector shared with apps/api (apps/api/src/lib/admin-signing.test.ts):
  // both implementations of the docs/10 §1 signature must agree byte-for-byte.
  test("matches the cross-service known-answer vector", async () => {
    const headers = await signAdminRequest({
      token: TOKEN,
      userId: USER_ID,
      body: '{"a":1}',
      timestamp: 1_700_000_000,
    });

    expect(headers[ADMIN_AUTH_HEADERS.signature]).toBe(
      "4cffc84195ebaf1fb01fcbd3f30c9a23eff734e0ed084b5b86ee26e2e0179fe0",
    );
  });
});

describe("createAdminAuth", () => {
  test("rejects a request without headers", async () => {
    const response = await buildApp().request("/v1/whoami");

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("UNAUTHORIZED");
  });

  test("rejects a wrong bearer token", async () => {
    const headers = await signAdminRequest({ token: "wrong-token", userId: USER_ID });
    const response = await buildApp().request("/v1/whoami", { headers });

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("UNAUTHORIZED");
  });

  test("rejects missing signature headers", async () => {
    const response = await buildApp().request("/v1/whoami", {
      headers: { [ADMIN_AUTH_HEADERS.authorization]: `Bearer ${TOKEN}` },
    });

    expect(response.status).toBe(401);
  });

  test("rejects a wrong signature", async () => {
    const headers = await signAdminRequest({ token: TOKEN, userId: USER_ID });
    const response = await buildApp().request("/v1/whoami", {
      headers: { ...headers, [ADMIN_AUTH_HEADERS.signature]: "deadbeef" },
    });

    expect(response.status).toBe(401);
  });

  test("rejects a stale timestamp", async () => {
    const headers = await signAdminRequest({
      token: TOKEN,
      userId: USER_ID,
      timestamp: Math.floor(Date.now() / 1000) - 120,
    });
    const response = await buildApp().request("/v1/whoami", { headers });

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("UNAUTHORIZED");
  });

  test("rejects a body that was tampered with after signing", async () => {
    const signedBody = '{"amount":"1.00"}';
    const headers = await signAdminRequest({ token: TOKEN, userId: USER_ID, body: signedBody });
    const response = await buildApp().request("/v1/echo", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: '{"amount":"999.00"}',
    });

    expect(response.status).toBe(401);
  });

  test("accepts a correctly signed request and exposes the user id", async () => {
    const body = '{"amount":"1.00"}';
    const headers = await signAdminRequest({ token: TOKEN, userId: USER_ID, body });
    const response = await buildApp().request("/v1/echo", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("signs a body-less GET correctly", async () => {
    const headers = await signAdminRequest({ token: TOKEN, userId: USER_ID });
    const response = await buildApp().request("/v1/whoami", { headers });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: USER_ID });
  });

  test("adminSignatureMessage is userId + newline + timestamp + newline + body", () => {
    expect(adminSignatureMessage("user_1", "1700000000", '{"a":1}')).toBe(
      'user_1\n1700000000\n{"a":1}',
    );
  });

  test("rejects every request when the admin token is not configured", async () => {
    const headers = await signAdminRequest({ token: TOKEN, userId: USER_ID });
    const response = await buildApp(() => undefined).request("/v1/whoami", { headers });

    expect(response.status).toBe(401);
  });
});

const kitty: KittyRow = {
  id: "kty_01JZZZZZZZZZZZZZZZZZZZZZZZ",
  eventId: "evt_01JZZZZZZZZZZZZZZZZZZZZZZZ",
  ownerUserId: "user_owner_1",
  currency: "USD",
  status: "open",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("ownership guards", () => {
  test("requireKitty throws KITTY_NOT_FOUND for a missing row", () => {
    try {
      requireKitty(undefined);
      throw new Error("expected requireKitty to throw");
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }

      expect(error.code).toBe("KITTY_NOT_FOUND");
      expect(error.httpStatus).toBe(404);
    }
  });

  test("assertKittyOwner rejects a different user with FORBIDDEN", () => {
    try {
      assertKittyOwner(kitty, "user_someone_else");
      throw new Error("expected assertKittyOwner to throw");
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }

      expect(error.code).toBe("FORBIDDEN");
      expect(error.httpStatus).toBe(403);
    }
  });

  test("requireOwnedKitty returns the row to its owner", () => {
    expect(requireOwnedKitty(kitty, "user_owner_1")).toBe(kitty);
  });
});
