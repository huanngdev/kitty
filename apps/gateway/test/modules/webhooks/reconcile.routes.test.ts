import { describe, expect, test } from "bun:test";
import { errorCodes, apiErrorSchema, reconcileSweepResponseSchema } from "@kitty/shared";
import { Hono } from "hono";
import { handleError } from "../../../src/app";
import { createInternalAuth } from "../../../src/modules/intents/internal-auth";
import { createReconcileRoutes } from "../../../src/modules/webhooks/reconcile.routes";
import type { ReconcileService } from "../../../src/modules/webhooks/reconcile.service";

/**
 * Tests of `POST /internal/sweeps/reconcile` (docs/10 §6): same bearer auth as
 * the rest of `/internal`, body parsed with the shared contract.
 */

const RESULT = { scanned: 2, settled: 1, failed: 0, unchanged: 1, errored: 0 };

function buildApp(input: { token?: string; body?: string }): Hono {
  const seen: unknown[] = [];
  const service: ReconcileService = {
    async reconcile(request) {
      seen.push(request);

      return RESULT;
    },
  };

  return new Hono().onError(handleError).route(
    "/internal",
    createReconcileRoutes(
      createInternalAuth(() => input.token ?? "internal-secret"),
      { service },
    ),
  );
}

async function postJson(app: Hono, body: string): Promise<Response> {
  return app.request("/internal/sweeps/reconcile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /internal/sweeps/reconcile", () => {
  test("requires the internal token", async () => {
    const app = buildApp({});

    const response = await postJson(app, "{}");

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(errorCodes.unauthorized);
  });

  test("applies the documented defaults to an empty body", async () => {
    const app = new Hono().onError(handleError).route(
      "/internal",
      createReconcileRoutes(
        createInternalAuth(() => "internal-secret"),
        {
          service: {
            async reconcile(request) {
              expect(request).toEqual({ olderThanMinutes: 5, limit: 25 });

              return RESULT;
            },
          },
        },
      ),
    );

    const response = await app.request("/internal/sweeps/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer internal-secret" },
      body: "{}",
    });

    expect(response.status).toBe(200);
    expect(reconcileSweepResponseSchema.parse(await response.json())).toEqual(RESULT);
  });

  test("passes an explicit window through and returns the sweep result", async () => {
    let received: unknown;
    const service: ReconcileService = {
      async reconcile(request) {
        received = request;

        return RESULT;
      },
    };
    const app = new Hono().onError(handleError).route(
      "/internal",
      createReconcileRoutes(
        createInternalAuth(() => "internal-secret"),
        { service },
      ),
    );

    const response = await app.request("/internal/sweeps/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer internal-secret" },
      body: JSON.stringify({ olderThanMinutes: 0, limit: 1 }),
    });

    expect(response.status).toBe(200);
    expect(received).toEqual({ olderThanMinutes: 0, limit: 1 });
    expect(reconcileSweepResponseSchema.parse(await response.json())).toEqual(RESULT);
  });

  test("rejects a malformed body with the shared validation error", async () => {
    const app = buildApp({});

    const response = await app.request("/internal/sweeps/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer internal-secret" },
      body: JSON.stringify({ olderThanMinutes: -1 }),
    });

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      errorCodes.validationFailed,
    );
  });
});
