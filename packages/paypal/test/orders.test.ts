import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import { buildClient, PAYPAL_BASE, server, tokenHandler, usePayPalServer } from "./support/server";

usePayPalServer();

const ORDERS_URL = `${PAYPAL_BASE}/v2/checkout/orders`;

describe("orders.create", () => {
  test("builds a CAPTURE order and reads the approve link", async () => {
    let captured: unknown;
    const requestIds: (string | null)[] = [];
    server.use(
      tokenHandler(),
      http.post(ORDERS_URL, async ({ request }) => {
        captured = await request.json();
        requestIds.push(request.headers.get("paypal-request-id"));

        return HttpResponse.json({
          id: "ORDER-1",
          status: "CREATED",
          links: [
            { rel: "self", href: `${ORDERS_URL}/ORDER-1` },
            { rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1" },
          ],
        });
      }),
    );

    const order = await buildClient().orders.create({
      requestId: "int_01ORDER",
      kittyId: "kty_01",
      invoiceId: "INV2-1",
      amountCents: 5000n,
      currency: "USD",
      description: "Top up",
    });

    expect(order).toEqual({
      orderId: "ORDER-1",
      status: "CREATED",
      approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1",
    });
    expect(requestIds).toEqual(["int_01ORDER"]);
    expect(captured).toEqual({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: "kty_01",
          invoice_id: "INV2-1",
          description: "Top up",
          amount: { currency_code: "USD", value: "50.00" },
        },
      ],
    });
  });

  test("falls back to the payer-action link", async () => {
    server.use(
      tokenHandler(),
      http.post(ORDERS_URL, () =>
        HttpResponse.json({
          id: "ORDER-2",
          status: "PAYER_ACTION_REQUIRED",
          links: [{ rel: "payer-action", href: "https://example.test/pay" }],
        }),
      ),
    );

    const order = await buildClient().orders.create({
      requestId: "int_02",
      kittyId: "kty_01",
      amountCents: 100n,
      currency: "USD",
    });

    expect(order.approveUrl).toBe("https://example.test/pay");
  });

  test("returns no approve url without links", async () => {
    server.use(
      tokenHandler(),
      http.post(ORDERS_URL, () => HttpResponse.json({ id: "ORDER-3", status: "CREATED" })),
    );

    const order = await buildClient().orders.create({
      requestId: "int_03",
      kittyId: "kty_01",
      amountCents: 100n,
      currency: "USD",
    });

    expect(order.approveUrl).toBeUndefined();
  });
});

describe("orders.get", () => {
  test("maps the order", async () => {
    server.use(
      tokenHandler(),
      http.get(`${ORDERS_URL}/ORDER-1`, () =>
        HttpResponse.json({ id: "ORDER-1", status: "APPROVED" }),
      ),
    );

    const order = await buildClient().orders.get({ orderId: "ORDER-1" });

    expect(order).toEqual({ orderId: "ORDER-1", status: "APPROVED", approveUrl: undefined });
  });
});

describe("orders.capture", () => {
  test("maps captures with cents", async () => {
    const requestIds: (string | null)[] = [];
    server.use(
      tokenHandler(),
      http.post(`${ORDERS_URL}/ORDER-1/capture`, ({ request }) => {
        requestIds.push(request.headers.get("paypal-request-id"));

        return HttpResponse.json({
          id: "ORDER-1",
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "CAP-1",
                    status: "COMPLETED",
                    amount: { currency_code: "USD", value: "50.00" },
                  },
                ],
              },
            },
          ],
        });
      }),
    );

    const capture = await buildClient().orders.capture({
      orderId: "ORDER-1",
      requestId: "int_cap",
    });

    expect(requestIds).toEqual(["int_cap"]);
    expect(capture).toEqual({
      orderId: "ORDER-1",
      status: "COMPLETED",
      captures: [{ captureId: "CAP-1", status: "COMPLETED", amountCents: 5000n, currency: "USD" }],
    });
  });

  test("tolerates a capture without purchase units", async () => {
    server.use(
      tokenHandler(),
      http.post(`${ORDERS_URL}/ORDER-2/capture`, () =>
        HttpResponse.json({ id: "ORDER-2", status: "COMPLETED" }),
      ),
    );

    const capture = await buildClient().orders.capture({
      orderId: "ORDER-2",
      requestId: "int_cap",
    });

    expect(capture.captures).toEqual([]);
  });
});
