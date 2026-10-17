import { formatMoney, parseMoney } from "@kitty/ledger";
import type { PayPalTransport } from "./http";
import { extractInvoiceId } from "./invoice-id";
import { invoiceActionSchema, invoiceDraftRequestSchema, invoiceSchema } from "./schemas";
import type {
  CreateInvoiceInput,
  InvoiceAction,
  InvoicingNamespace,
  Invoice,
  InvoicePayment,
  InvoiceRef,
} from "./types";

/** Cancels answer `204 No Content`; everything else must be a JSON object. */
function parseInvoiceAction(data: unknown): { status?: string; href?: string } {
  if (data === undefined || data === null || data === "") {
    return {};
  }

  return invoiceActionSchema.parse(data);
}

/** Invoicing v2 endpoints (docs/11-paypal-integration.md §2.1). */
export function createInvoicingNamespace(transport: PayPalTransport): InvoicingNamespace {
  return {
    async createDraft(input: CreateInvoiceInput): Promise<InvoiceRef> {
      const body = invoiceDraftRequestSchema.parse({
        detail: {
          currency_code: input.currency,
          invoice_number: input.invoiceNumber,
          reference: input.reference,
          note: input.note,
          payment_term: { due_date: input.dueDate },
        },
        invoicer: {
          email_address: input.invoicerEmail,
          business_name: input.invoicerBusinessName,
        },
        primary_recipients: [
          {
            billing_info: {
              email_address: input.recipientEmail,
              name:
                input.recipientName !== undefined ? { given_name: input.recipientName } : undefined,
            },
          },
        ],
        items: input.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit_amount: { currency_code: input.currency, value: formatMoney(item.amountCents) },
        })),
        configuration: {
          allow_tip: input.allowTip ?? false,
          partial_payment: { allow_partial_payment: input.allowPartialPayment ?? false },
        },
      });

      return transport.request<InvoiceRef>({
        method: "POST",
        path: "/v2/invoicing/invoices",
        requestId: input.requestId,
        body,
        // Invoicing v2 still answers 201 with a HATEOAS link, so the id comes
        // from the body href or the Location header (see `extractInvoiceId`).
        headers: { Prefer: "return=representation" },
        parse: (data, response): InvoiceRef => ({
          invoiceId: extractInvoiceId({
            body: data,
            location: response.headers["location"] ?? null,
          }),
        }),
      });
    },

    async send(input): Promise<InvoiceAction> {
      const result = await transport.request({
        method: "POST",
        path: `/v2/invoicing/invoices/${encodeURIComponent(input.invoiceId)}/send`,
        requestId: input.requestId,
        body: {},
        parse: parseInvoiceAction,
      });

      return { invoiceId: input.invoiceId, status: result.status, href: result.href };
    },

    async get(input): Promise<Invoice> {
      return transport.request<Invoice>({
        method: "GET",
        path: `/v2/invoicing/invoices/${encodeURIComponent(input.invoiceId)}`,
        parse: (data): Invoice => {
          const invoice = invoiceSchema.parse(data);
          const payments: InvoicePayment[] = (invoice.payments?.transactions ?? []).flatMap(
            (transaction) => {
              if (transaction.payment_id === undefined) {
                return [];
              }

              const payment: InvoicePayment = {
                captureId: transaction.payment_id,
                // The wire value is a string; convert it to bigint cents.
                amountCents:
                  transaction.amount !== undefined
                    ? parseMoney(transaction.amount.value)
                    : undefined,
                currency: transaction.amount?.currency_code,
              };

              return [payment];
            },
          );

          return {
            invoiceId: invoice.id,
            status: invoice.status,
            invoiceNumber: invoice.detail?.invoice_number,
            currency: invoice.detail?.currency_code,
            reference: invoice.detail?.reference,
            payerUrl: invoice.links?.find((link) => link.rel === "payer-view")?.href,
            payments,
          };
        },
      });
    },

    async remind(input): Promise<InvoiceAction> {
      const result = await transport.request({
        method: "POST",
        path: `/v2/invoicing/invoices/${encodeURIComponent(input.invoiceId)}/remind`,
        requestId: input.requestId,
        body: {},
        parse: parseInvoiceAction,
      });

      return { invoiceId: input.invoiceId, status: result.status, href: result.href };
    },

    async cancel(input): Promise<InvoiceAction> {
      const result = await transport.request({
        method: "POST",
        path: `/v2/invoicing/invoices/${encodeURIComponent(input.invoiceId)}/cancel`,
        requestId: input.requestId,
        body: {},
        parse: parseInvoiceAction,
      });

      return { invoiceId: input.invoiceId, status: result.status, href: result.href };
    },
  };
}
