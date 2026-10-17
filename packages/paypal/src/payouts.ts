import { formatMoney, parseMoney } from "@kitty/ledger";
import type { z } from "zod";
import type { PayPalTransport } from "./http";
import {
  payoutBatchSchema,
  payoutCreateSchema,
  payoutItemCurrency,
  payoutItemSchema,
  payoutRequestSchema,
} from "./schemas";
import type {
  CreatePayoutInput,
  PayoutBatch,
  PayoutBatchResult,
  PayoutItem,
  PayoutsNamespace,
} from "./types";

type PayoutItemWire = z.infer<typeof payoutItemSchema>;

/**
 * Maps a Payouts item to the domain shape (amount → bigint cents).
 *
 * The item lookup key `sender_item_id` sits in the nested `payout_item` model
 * for `GET /v1/payments/payouts/{id}` and `/v1/payments/payouts-item/{id}`; the
 * flat spelling is kept as a fallback because webhook resources use it.
 */
function toPayoutItem(item: PayoutItemWire): PayoutItem {
  const nested = item.payout_item;
  const amount = nested?.amount ?? item.amount;

  return {
    itemId: item.payout_item_id,
    status: item.transaction_status,
    batchId: item.payout_batch_id,
    senderItemId: nested?.sender_item_id ?? item.sender_item_id,
    amountCents: amount === undefined ? undefined : parseMoney(amount.value),
    currency: amount === undefined ? undefined : payoutItemCurrency(amount),
  };
}

/** Payouts v1 endpoints (docs/11-paypal-integration.md §2.3). */
export function createPayoutsNamespace(transport: PayPalTransport): PayoutsNamespace {
  return {
    async createSingle(input: CreatePayoutInput): Promise<PayoutBatchResult> {
      const body = payoutRequestSchema.parse({
        sender_batch_header: {
          sender_batch_id: input.senderBatchId,
          email_subject: input.emailSubject ?? "Payment from Kitty",
          email_message: input.emailMessage ?? input.note,
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: { value: formatMoney(input.amountCents), currency: input.currency },
            receiver: input.payeeEmail,
            note: input.note,
            // The item lookup key for `PAYMENT.PAYOUTS-ITEM.*` webhooks
            // (docs/11 §3). Kitty passes the intent id here.
            sender_item_id: input.senderItemId ?? input.senderBatchId,
          },
        ],
      });

      return transport.request<PayoutBatchResult>({
        method: "POST",
        path: "/v1/payments/payouts",
        // PayPal rejects a duplicate `sender_batch_id`; the request id doubles
        // as the batch id so both layers are idempotent (docs/11 §4).
        requestId: input.requestId,
        body,
        parse: (data): PayoutBatchResult => {
          const parsed = payoutCreateSchema.parse(data);

          return {
            batchId: parsed.batch_header.payout_batch_id,
            status: parsed.batch_header.batch_status,
          };
        },
      });
    },

    async getBatch(input): Promise<PayoutBatch> {
      return transport.request<PayoutBatch>({
        method: "GET",
        path: `/v1/payments/payouts/${encodeURIComponent(input.batchId)}`,
        parse: (data): PayoutBatch => {
          const parsed = payoutBatchSchema.parse(data);
          const header = parsed.batch_header;

          return {
            batchId: header?.payout_batch_id,
            senderBatchId: header?.sender_batch_id,
            status: header?.batch_status,
            createdAt: header?.time_created,
            items: (parsed.items ?? []).map(toPayoutItem),
          };
        },
      });
    },

    async getItem(input): Promise<PayoutItem> {
      return transport.request<PayoutItem>({
        method: "GET",
        path: `/v1/payments/payouts-item/${encodeURIComponent(input.itemId)}`,
        parse: (data): PayoutItem => toPayoutItem(payoutItemSchema.parse(data)),
      });
    },
  };
}
