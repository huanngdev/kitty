import { formatMoney, parseMoney } from "@kitty/ledger";
import type { PayPalTransport } from "./http";
import { refundRequestSchema, refundSchema } from "./schemas";
import type { PaymentsNamespace, Refund, RefundCaptureInput } from "./types";

/** Payments v2 endpoints (docs/11-paypal-integration.md §2.4). */
export function createPaymentsNamespace(transport: PayPalTransport): PaymentsNamespace {
  return {
    async refundCapture(input: RefundCaptureInput): Promise<Refund> {
      const body = refundRequestSchema.parse({
        amount:
          input.amountCents !== undefined
            ? {
                value: formatMoney(input.amountCents),
                currency_code: input.currency ?? "USD",
              }
            : undefined,
        invoice_id: input.invoiceId,
        note_to_payer: input.note,
      });

      return transport.request<Refund>({
        method: "POST",
        path: `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
        requestId: input.requestId,
        body,
        parse: (data): Refund => {
          const refund = refundSchema.parse(data);

          return {
            refundId: refund.id,
            status: refund.status,
            amountCents: refund.amount !== undefined ? parseMoney(refund.amount.value) : undefined,
            currency: refund.amount?.currency_code,
            invoiceId: refund.invoice_id,
          };
        },
      });
    },
  };
}
