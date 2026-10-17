import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import { z } from "zod";
import { buildClient, PAYPAL_BASE, server, tokenHandler, usePayPalServer } from "./support/server";

usePayPalServer();

describe("malformed PayPal responses are rejected by Zod", () => {
  test("orders.create requires id and status", async () => {
    server.use(
      tokenHandler(),
      http.post(`${PAYPAL_BASE}/v2/checkout/orders`, () => HttpResponse.json({ id: "ORDER-1" })),
    );

    await expect(
      buildClient().orders.create({
        requestId: "int_1",
        kittyId: "kty_1",
        amountCents: 100n,
        currency: "USD",
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  test("invoicing.get rejects a malformed money value", async () => {
    server.use(
      tokenHandler(),
      http.get(`${PAYPAL_BASE}/v2/invoicing/invoices/INV2-1`, () =>
        HttpResponse.json({
          id: "INV2-1",
          payments: {
            transactions: [{ payment_id: "CAP-1", amount: { currency_code: "USD", value: "1.0" } }],
          },
        }),
      ),
    );

    await expect(buildClient().invoicing.get({ invoiceId: "INV2-1" })).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });

  test("payouts.createSingle requires the batch header", async () => {
    server.use(
      tokenHandler(),
      http.post(`${PAYPAL_BASE}/v1/payments/payouts`, () => HttpResponse.json({})),
    );

    await expect(
      buildClient().payouts.createSingle({
        requestId: "int_1",
        senderBatchId: "int_1",
        payeeEmail: "vendor@example.com",
        amountCents: 100n,
        currency: "USD",
        note: "note",
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  test("a malformed OAuth token response is rejected", async () => {
    server.use(
      http.post(`${PAYPAL_BASE}/v1/oauth2/token`, () =>
        HttpResponse.json({ token_type: "Bearer" }),
      ),
      http.get(`${PAYPAL_BASE}/v2/checkout/orders/ORDER-1`, () =>
        HttpResponse.json({ id: "ORDER-1", status: "COMPLETED" }),
      ),
    );

    await expect(buildClient().orders.get({ orderId: "ORDER-1" })).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});

describe("outgoing bodies are validated before leaving the client", () => {
  test("createDraft rejects a malformed recipient email", async () => {
    await expect(
      buildClient().invoicing.createDraft({
        requestId: "int_1",
        invoiceNumber: "KTY-1",
        currency: "USD",
        dueDate: "2026-11-20",
        invoicerEmail: "platform@example.com",
        recipientEmail: "not-an-email",
        items: [{ name: "Share", quantity: "1", amountCents: 100n }],
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  test("createSingle rejects an empty note (email_message)", async () => {
    await expect(
      buildClient().payouts.createSingle({
        requestId: "int_1",
        senderBatchId: "int_1",
        payeeEmail: "vendor@example.com",
        amountCents: 100n,
        currency: "USD",
        note: "",
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
