import { describe, expect, test } from "bun:test";
import {
  ADMIN_AUTH_HEADERS,
  adminSignatureMessage,
  signAdminRequest,
} from "../../src/lib/admin-signing";

const TOKEN = "test-admin-token";
const USER_ID = "user_owner_1";

/**
 * Known-answer vector shared with `apps/gateway/src/admin/auth.test.ts`. Both
 * services must agree byte-for-byte, so the same input asserts the same hex on
 * both sides (docs/10-api-spec.md §1).
 */
const VECTOR = {
  token: TOKEN,
  userId: USER_ID,
  body: '{"a":1}',
  timestamp: 1_700_000_000,
  signature: "4cffc84195ebaf1fb01fcbd3f30c9a23eff734e0ed084b5b86ee26e2e0179fe0",
} as const;

describe("adminSignatureMessage", () => {
  test("is userId + newline + timestamp + newline + rawBody", () => {
    expect(adminSignatureMessage(USER_ID, "1700000000", VECTOR.body)).toBe(
      `${USER_ID}\n1700000000\n${VECTOR.body}`,
    );
  });
});

describe("signAdminRequest", () => {
  test("matches the known-answer vector shared with the gateway", async () => {
    const headers = await signAdminRequest({
      token: VECTOR.token,
      userId: VECTOR.userId,
      body: VECTOR.body,
      timestamp: VECTOR.timestamp,
    });

    expect(headers[ADMIN_AUTH_HEADERS.signature]).toBe(VECTOR.signature);
  });

  test("produces the bearer, user and second-granularity timestamp headers", async () => {
    const headers = await signAdminRequest({
      token: TOKEN,
      userId: USER_ID,
      body: VECTOR.body,
      timestamp: VECTOR.timestamp,
    });

    expect(headers[ADMIN_AUTH_HEADERS.authorization]).toBe(`Bearer ${TOKEN}`);
    expect(headers[ADMIN_AUTH_HEADERS.user]).toBe(USER_ID);
    expect(headers[ADMIN_AUTH_HEADERS.timestamp]).toBe("1700000000");
  });

  test("signs a body-less GET over the empty string", async () => {
    const headers = await signAdminRequest({
      token: TOKEN,
      userId: USER_ID,
      timestamp: VECTOR.timestamp,
    });

    expect(headers[ADMIN_AUTH_HEADERS.signature]).toMatch(/^[0-9a-f]{64}$/);
  });
});
