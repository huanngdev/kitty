import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import { buildClient, PAYPAL_BASE, server, tokenHandler, usePayPalServer } from "./support/server";

usePayPalServer();

const REFUND_URL = `${PAYPAL_BASE}/v2/payments/captures/CAP-1/refund`;

describe("payments.refundCapture", () => {
  test("sends a partial refund with the amount formatted and USD default", async () => {
    let captured: unknown;
    const requestIds: (string | null)[] = [];
    server.use(
      tokenHandler(),
      http.post(REFUND_URL, async ({ request }) => {
        captured = await request.json();
        requestIds.push(request.headers.get("paypal-request-id"));

        return HttpResponse.json({
          id: "REFUND-1",
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "12.34" },
          invoice_id: "INV2-1",
        });
      }),
    );

    const refund = await buildClient().payments.refundCapture({
      requestId: "int_01REFUND",
      captureId: "CAP-1",
      amountCents: 1234n,
      invoiceId: "INV2-1",
      note: "Surplus refund",
    });

    expect(requestIds).toEqual(["int_01REFUND"]);
    expect(captured).toEqual({
      amount: { value: "12.34", currency_code: "USD" },
      invoice_id: "INV2-1",
      note_to_payer: "Surplus refund",
    });
    expect(refund).toEqual({
      refundId: "REFUND-1",
      status: "COMPLETED",
      amountCents: 1234n,
      currency: "USD",
      invoiceId: "INV2-1",
    });
  });

  test("omits the amount for a full refund and honours a currency", async () => {
    let captured: unknown;
    server.use(
      tokenHandler(),
      http.post(REFUND_URL, async ({ request }) => {
        captured = await request.json();

        return HttpResponse.json({ id: "REFUND-2", status: "COMPLETED" });
      }),
    );

    const refund = await buildClient().payments.refundCapture({
      requestId: "int_02",
      captureId: "CAP-1",
      currency: "EUR",
    });

    expect(captured).toEqual({
      amount: undefined,
      invoice_id: undefined,
      note_to_payer: undefined,
    });
    expect(refund.amountCents).toBeUndefined();
    expect(refund.currency).toBeUndefined();
  });
});
