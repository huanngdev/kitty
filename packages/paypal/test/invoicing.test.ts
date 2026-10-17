import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import { buildClient, PAYPAL_BASE, server, tokenHandler, usePayPalServer } from "./support/server";

usePayPalServer();

const INVOICES_URL = `${PAYPAL_BASE}/v2/invoicing/invoices`;

const draftInput = {
  requestId: "int_01CREATE",
  invoiceNumber: "KTY-DL-0007",
  currency: "USD",
  dueDate: "2026-11-20",
  invoicerEmail: "platform@example.com",
  invoicerBusinessName: "Kitty — Da Lat",
  recipientEmail: "tuan@example.com",
  recipientName: "Tuan",
  reference: "int_01CREATE",
  note: "Your share",
  items: [{ name: "Offsite share", quantity: "1", amountCents: 33400n }],
} as const;

describe("invoicing.createDraft", () => {
  test("sends the draft with Prefer, request id and formatted money", async () => {
    let capturedBody: unknown;
    const capturedPrefer: (string | null)[] = [];
    const capturedRequestId: (string | null)[] = [];
    server.use(
      tokenHandler(),
      http.post(INVOICES_URL, async ({ request }) => {
        capturedBody = await request.json();
        capturedPrefer.push(request.headers.get("prefer"));
        capturedRequestId.push(request.headers.get("paypal-request-id"));

        return new HttpResponse(null, {
          status: 201,
          headers: { Location: `${INVOICES_URL}/INV2-LOCATION` },
        });
      }),
    );

    const result = await buildClient().invoicing.createDraft(draftInput);

    expect(result).toEqual({ invoiceId: "INV2-LOCATION" });
    expect(capturedPrefer).toEqual(["return=representation"]);
    expect(capturedRequestId).toEqual(["int_01CREATE"]);
    expect(capturedBody).toEqual({
      detail: {
        currency_code: "USD",
        invoice_number: "KTY-DL-0007",
        reference: "int_01CREATE",
        note: "Your share",
        payment_term: { due_date: "2026-11-20" },
      },
      invoicer: {
        email_address: "platform@example.com",
        business_name: "Kitty — Da Lat",
      },
      primary_recipients: [
        {
          billing_info: {
            email_address: "tuan@example.com",
            name: { given_name: "Tuan" },
          },
        },
      ],
      items: [
        {
          name: "Offsite share",
          quantity: "1",
          unit_amount: { currency_code: "USD", value: "334.00" },
        },
      ],
      configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } },
    });
  });

  test("falls back to the href in the body for the invoice id", async () => {
    server.use(
      tokenHandler(),
      http.post(INVOICES_URL, () =>
        HttpResponse.json(
          { rel: "self", href: `${INVOICES_URL}/INV2-HREF`, method: "GET" },
          { status: 201 },
        ),
      ),
    );

    const result = await buildClient().invoicing.createDraft(draftInput);

    expect(result).toEqual({ invoiceId: "INV2-HREF" });
  });
});

describe("invoicing actions", () => {
  test("send returns the action status and href", async () => {
    const requestIds: (string | null)[] = [];
    server.use(
      tokenHandler(),
      http.post(`${INVOICES_URL}/INV2-1/send`, ({ request }) => {
        requestIds.push(request.headers.get("paypal-request-id"));

        return HttpResponse.json(
          { href: "https://api-m.sandbox.paypal.com/send" },
          { status: 202 },
        );
      }),
    );

    const result = await buildClient().invoicing.send({
      invoiceId: "INV2-1",
      requestId: "int_send",
    });

    expect(result).toEqual({
      invoiceId: "INV2-1",
      status: undefined,
      href: "https://api-m.sandbox.paypal.com/send",
    });
    expect(requestIds).toEqual(["int_send"]);
  });

  test("remind returns the action payload", async () => {
    server.use(
      tokenHandler(),
      http.post(`${INVOICES_URL}/INV2-1/remind`, () =>
        HttpResponse.json({ href: "https://api-m.sandbox.paypal.com/remind" }, { status: 202 }),
      ),
    );

    const result = await buildClient().invoicing.remind({
      invoiceId: "INV2-1",
      requestId: "int_remind",
    });

    expect(result.href).toBe("https://api-m.sandbox.paypal.com/remind");
  });

  test("cancel tolerates 204 No Content", async () => {
    server.use(
      tokenHandler(),
      http.post(`${INVOICES_URL}/INV2-1/cancel`, () => new HttpResponse(null, { status: 204 })),
    );

    const result = await buildClient().invoicing.cancel({
      invoiceId: "INV2-1",
      requestId: "int_cancel",
    });

    expect(result).toEqual({ invoiceId: "INV2-1", status: undefined, href: undefined });
  });
});

describe("invoicing.get", () => {
  test("maps the invoice, payer-view link and payment amounts to cents", async () => {
    server.use(
      tokenHandler(),
      http.get(`${INVOICES_URL}/INV2-1`, () =>
        HttpResponse.json({
          id: "INV2-1",
          status: "PAID",
          detail: {
            invoice_number: "KTY-DL-0007",
            currency_code: "USD",
            reference: "int_01CREATE",
          },
          payments: {
            transactions: [
              { payment_id: "CAP-1", amount: { currency_code: "USD", value: "334.00" } },
            ],
          },
          links: [
            { rel: "self", href: `${INVOICES_URL}/INV2-1` },
            { rel: "payer-view", href: "https://www.sandbox.paypal.com/invoice/p/#INV2-1" },
          ],
        }),
      ),
    );

    const invoice = await buildClient().invoicing.get({ invoiceId: "INV2-1" });

    expect(invoice.invoiceId).toBe("INV2-1");
    expect(invoice.status).toBe("PAID");
    expect(invoice.invoiceNumber).toBe("KTY-DL-0007");
    expect(invoice.currency).toBe("USD");
    expect(invoice.reference).toBe("int_01CREATE");
    expect(invoice.payerUrl).toBe("https://www.sandbox.paypal.com/invoice/p/#INV2-1");
    expect(invoice.payments).toEqual([
      { captureId: "CAP-1", amountCents: 33400n, currency: "USD" },
    ]);
  });

  test("tolerates an invoice without payments or links", async () => {
    server.use(
      tokenHandler(),
      http.get(`${INVOICES_URL}/INV2-2`, () =>
        HttpResponse.json({ id: "INV2-2", status: "DRAFT" }),
      ),
    );

    const invoice = await buildClient().invoicing.get({ invoiceId: "INV2-2" });

    expect(invoice.payments).toEqual([]);
    expect(invoice.payerUrl).toBeUndefined();
    expect(invoice.invoiceNumber).toBeUndefined();
  });

  test("skips payments without a payment id", async () => {
    server.use(
      tokenHandler(),
      http.get(`${INVOICES_URL}/INV2-3`, () =>
        HttpResponse.json({
          id: "INV2-3",
          payments: { transactions: [{ amount: { currency_code: "USD", value: "5.00" } }] },
        }),
      ),
    );

    const invoice = await buildClient().invoicing.get({ invoiceId: "INV2-3" });

    expect(invoice.payments).toEqual([]);
  });
});
