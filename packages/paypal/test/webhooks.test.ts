import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import { z } from "zod";
import { buildClient, PAYPAL_BASE, server, tokenHandler, usePayPalServer } from "./support/server";
import { pickWebhookHeaders, WEBHOOK_TRANSMISSION_HEADERS } from "../src/webhooks";

usePayPalServer();

const VERIFY_URL = `${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`;
const EVENT = { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED" };
const RAW_BODY = JSON.stringify(EVENT);

const headersInput: Record<string, string | undefined> = {
  "PAYPAL-TRANSMISSION-ID": "trans-1",
  "Paypal-Transmission-Time": "2026-10-17T10:00:00Z",
  "paypal-cert-url": "https://api.paypal.com/cert.pem",
  "PAYPAL-AUTH-ALGO": "SHA256withRSA",
  "PAYPAL-TRANSMISSION-SIG": "sig-1",
};

describe("pickWebhookHeaders", () => {
  test("matches the five transmission headers case-insensitively", () => {
    expect(pickWebhookHeaders(headersInput)).toEqual({
      transmissionId: "trans-1",
      transmissionTime: "2026-10-17T10:00:00Z",
      certUrl: "https://api.paypal.com/cert.pem",
      authAlgo: "SHA256withRSA",
      transmissionSig: "sig-1",
    });
  });

  test("returns empty strings for missing headers", () => {
    expect(pickWebhookHeaders({})).toEqual({
      transmissionId: "",
      transmissionTime: "",
      certUrl: "",
      authAlgo: "",
      transmissionSig: "",
    });
  });

  test("ignores non-string header values", () => {
    const headers: Record<string, string | undefined> = {
      "PayPal-Transmission-Id": undefined,
      "PayPal-Auth-Algo": "SHA256withRSA",
    };

    expect(pickWebhookHeaders(headers).transmissionId).toBe("");
    expect(pickWebhookHeaders(headers).authAlgo).toBe("SHA256withRSA");
  });

  test("exposes the canonical header names", () => {
    expect(WEBHOOK_TRANSMISSION_HEADERS.transmissionSig).toBe("paypal-transmission-sig");
  });
});

describe("webhooks.verifySignature", () => {
  test("returns true for SUCCESS and forwards the parsed event", async () => {
    let captured: unknown;
    server.use(
      tokenHandler(),
      http.post(VERIFY_URL, async ({ request }) => {
        captured = await request.json();

        return HttpResponse.json({ verification_status: "SUCCESS" });
      }),
    );

    const ok = await buildClient().webhooks.verifySignature({
      headers: headersInput,
      rawBody: RAW_BODY,
      webhookId: "WH-ID",
    });

    expect(ok).toBe(true);
    expect(captured).toEqual({
      transmission_id: "trans-1",
      transmission_time: "2026-10-17T10:00:00Z",
      cert_url: "https://api.paypal.com/cert.pem",
      auth_algo: "SHA256withRSA",
      transmission_sig: "sig-1",
      webhook_id: "WH-ID",
      webhook_event: EVENT,
    });
  });

  test("returns false for any non-SUCCESS status", async () => {
    server.use(
      tokenHandler(),
      http.post(VERIFY_URL, () => HttpResponse.json({ verification_status: "FAILURE" })),
    );

    const ok = await buildClient().webhooks.verifySignature({
      headers: headersInput,
      rawBody: RAW_BODY,
      webhookId: "WH-ID",
    });

    expect(ok).toBe(false);
  });

  test("fails closed when a transmission header is missing", async () => {
    server.use(tokenHandler());

    await expect(
      buildClient().webhooks.verifySignature({
        headers: {},
        rawBody: RAW_BODY,
        webhookId: "WH-ID",
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  test("surfaces a malformed JSON body as a SyntaxError", async () => {
    server.use(tokenHandler());

    await expect(
      buildClient().webhooks.verifySignature({
        headers: headersInput,
        rawBody: "{not-json",
        webhookId: "WH-ID",
      }),
    ).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe("webhooks.getWebhook", () => {
  test("maps the registered webhook and its event types", async () => {
    server.use(
      tokenHandler(),
      http.get(`${PAYPAL_BASE}/v1/notifications/webhooks/WH-ID`, () =>
        HttpResponse.json({
          id: "WH-ID",
          url: "https://kitty.example.com/webhooks/paypal",
          event_types: [
            { name: "PAYMENT.CAPTURE.COMPLETED" },
            { name: "INVOICING.INVOICE.PAID" },
            {},
          ],
        }),
      ),
    );

    const webhook = await buildClient().webhooks.getWebhook({ webhookId: "WH-ID" });

    expect(webhook).toEqual({
      id: "WH-ID",
      url: "https://kitty.example.com/webhooks/paypal",
      eventTypes: ["PAYMENT.CAPTURE.COMPLETED", "INVOICING.INVOICE.PAID"],
    });
  });
});
