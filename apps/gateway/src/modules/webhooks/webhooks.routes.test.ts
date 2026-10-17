import { describe, expect, test } from "bun:test";
import type { PaypalWebhookEvent, VerifyWebhookInput } from "@kitty/paypal";
import { errorCodes, apiErrorSchema, webhookAckSchema } from "@kitty/shared";
import { Hono } from "hono";
import { handleError } from "../../app";
import type { WebhookHandleResult, WebhooksService } from "./webhooks.service";
import { createWebhooksRoutes } from "./webhooks.routes";
import { payoutItemEventPayload } from "./test-support/fixtures";

/**
 * Tests of `POST /webhooks/paypal` (docs/10 §5).
 *
 * The PayPal API call is injected, so the ordering guarantees — config →
 * raw body → verify → dispatch — can be asserted without a network.
 */

interface Harness {
  readonly app: Hono;
  readonly verified: VerifyWebhookInput[];
  readonly handled: PaypalWebhookEvent[];
}

function buildHarness(input: {
  /** `null` models a missing `PAYPAL_WEBHOOK_ID`; omitted uses a test id. */
  webhookId?: string | null;
  verify?: boolean;
  result?: WebhookHandleResult;
}): Harness {
  const verified: VerifyWebhookInput[] = [];
  const handled: PaypalWebhookEvent[] = [];

  const service: WebhooksService = {
    async handleEvent(event) {
      handled.push(event);

      return input.result ?? { duplicate: false, status: "processed" };
    },
  };

  const app = new Hono().onError(handleError).route(
    "/webhooks",
    createWebhooksRoutes({
      getWebhookId: () => (input.webhookId === null ? undefined : (input.webhookId ?? "WEBHOOK-1")),
      verifySignature: async (verifyInput) => {
        verified.push(verifyInput);

        return input.verify ?? true;
      },
      service,
    }),
  );

  return { app, verified, handled };
}

async function post(app: Hono, body: string): Promise<Response> {
  return app.request("/webhooks/paypal", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paypal-transmission-id": "TRANSMISSION-1",
    },
    body,
  });
}

describe("POST /webhooks/paypal", () => {
  test("verifies the raw body and dispatches the parsed event", async () => {
    const harness = buildHarness({ result: { duplicate: false, status: "processed" } });
    const body = JSON.stringify(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"));

    const response = await post(harness.app, body);

    expect(response.status).toBe(200);
    expect(webhookAckSchema.parse(await response.json())).toEqual({
      ok: true,
      duplicate: false,
      status: "processed",
    });
    // The bytes PayPal signed are what gets verified — never a re-encoded body.
    expect(harness.verified).toHaveLength(1);
    expect(harness.verified[0]?.rawBody).toBe(body);
    expect(harness.verified[0]?.webhookId).toBe("WEBHOOK-1");
    expect(harness.verified[0]?.headers["paypal-transmission-id"]).toBe("TRANSMISSION-1");
    expect(harness.handled[0]?.kind).toBe("payout_item");
  });

  test("rejects a failed signature with 400 and touches nothing", async () => {
    const harness = buildHarness({ verify: false });

    const response = await post(
      harness.app,
      JSON.stringify(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED")),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: errorCodes.webhookSignatureInvalid,
        message: errorCodes.webhookSignatureInvalid,
        details: { eventId: "WH-2WR32451HC0233532-67976317FL4543714" },
      },
    });
    expect(harness.handled).toHaveLength(0);
  });

  test("fails closed with 503 when PAYPAL_WEBHOOK_ID is not configured", async () => {
    const harness = buildHarness({ webhookId: null });

    const response = await post(harness.app, "{}");

    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      errorCodes.webhookNotConfigured,
    );
    expect(harness.verified).toHaveLength(0);
    expect(harness.handled).toHaveLength(0);
  });

  test("rejects a body that is not JSON", async () => {
    const harness = buildHarness({});

    const response = await post(harness.app, "not json");

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      errorCodes.webhookPayloadInvalid,
    );
    expect(harness.verified).toHaveLength(0);
  });

  test("rejects a verified payload with no event id", async () => {
    const harness = buildHarness({});

    const response = await post(
      harness.app,
      JSON.stringify({ event_type: "PAYMENT.CAPTURE.COMPLETED" }),
    );

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
      errorCodes.webhookPayloadInvalid,
    );
    expect(harness.handled).toHaveLength(0);
  });

  test("answers 200 for a duplicate delivery so PayPal stops retrying", async () => {
    const harness = buildHarness({ result: { duplicate: true, status: "ignored" } });

    const response = await post(
      harness.app,
      JSON.stringify(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED")),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: true, status: "ignored" });
  });
});
