import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { Hono } from "hono";
import { handleError } from "../../src/app";
import { createAdminAuth, signAdminRequest } from "../../src/admin/auth";
import { createV1Routes } from "../../src/modules/v1";

const TOKEN = "route-test-token";
const USER_ID = "user_route_1";

const app = new Hono()
  .onError(handleError)
  .route("/v1", createV1Routes(createAdminAuth(() => TOKEN)));

interface RequestOptions {
  readonly method?: string;
  readonly body?: string;
}

async function signedRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = await signAdminRequest({
    token: TOKEN,
    userId: USER_ID,
    body: options.body ?? "",
  });

  return app.request(path, {
    method: options.method ?? "GET",
    headers:
      options.body === undefined ? headers : { ...headers, "content-type": "application/json" },
    body: options.body,
  });
}

async function errorBody(response: Response): Promise<{ code: string; details?: unknown }> {
  const parsed = apiErrorSchema.parse(await response.json());

  return { code: parsed.error.code, details: parsed.error.details };
}

const validKittyBody = JSON.stringify({ eventId: "evt_01JZZZZZZZZZZZZZZZZZZZZZZZ" });

describe("/v1 auth wiring", () => {
  test("rejects an unauthenticated request", async () => {
    const response = await app.request("/v1/kitties", { method: "POST" });

    expect(response.status).toBe(401);
    expect((await errorBody(response)).code).toBe("UNAUTHORIZED");
  });
});

describe("/v1 request validation", () => {
  test("rejects an invalid kitty body before hitting the database", async () => {
    const response = await signedRequest("/v1/kitties", {
      method: "POST",
      body: JSON.stringify({ eventId: "not-an-event-id" }),
    });

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe("VALIDATION_FAILED");
  });

  test("rejects an invalid kitty id path param", async () => {
    const response = await signedRequest("/v1/kitties/nope");

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe("VALIDATION_FAILED");
  });

  test("rejects an invalid leash id path param", async () => {
    const response = await signedRequest("/v1/leashes/nope");

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe("VALIDATION_FAILED");
  });

  test("rejects a non money-string allocation", async () => {
    const response = await signedRequest("/v1/leashes", {
      method: "POST",
      body: JSON.stringify({
        kittyId: "kty_01JZZZZZZZZZZZZZZZZZZZZZZZ",
        agentId: "agt_01JZZZZZZZZZZZZZZZZZZZZZZZ",
        allocation: "25",
        limits: { perTxMax: "10.00", dailyMax: "20.00", maxTxPerHour: 6 },
        allowedActions: ["payout"],
        expiresAt: "2026-12-25T00:00:00.000Z",
      }),
    });

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe("VALIDATION_FAILED");
  });

  test("rejects an unknown action", async () => {
    const response = await signedRequest("/v1/leashes", {
      method: "POST",
      body: JSON.stringify({
        kittyId: "kty_01JZZZZZZZZZZZZZZZZZZZZZZZ",
        agentId: "agt_01JZZZZZZZZZZZZZZZZZZZZZZZ",
        allocation: "25.00",
        limits: { perTxMax: "10.00", dailyMax: "20.00", maxTxPerHour: 6 },
        allowedActions: ["teleport"],
        expiresAt: "2026-12-25T00:00:00.000Z",
      }),
    });

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe("VALIDATION_FAILED");
  });

  test("rejects a non-UUID payee email path segment", async () => {
    const response = await signedRequest("/v1/kitties/nope/payees/vendor@example.com", {
      method: "DELETE",
    });

    expect(response.status).toBe(400);
    expect((await errorBody(response)).code).toBe("VALIDATION_FAILED");
  });
});

describe("/v1 database wiring", () => {
  test("reaches the service and reports a missing database with 503", async () => {
    // `bun run test` runs with `--no-env-file`, so DATABASE_URL is unset and the
    // lazy db client fails with a clear error once validation has passed.
    const response = await signedRequest("/v1/kitties", { method: "POST", body: validKittyBody });

    expect(response.status).toBe(503);
    expect((await errorBody(response)).code).toBe("DATABASE_URL_MISSING");
  });
});
