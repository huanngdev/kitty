import type { SpendIntentRow } from "@kitty/db/schema";
import type { PayoutBatch, PayoutItem } from "@kitty/paypal";
import type { PayoutStatusReader } from "../../../src/lib/paypal";

/**
 * Fixtures for the webhook tests.
 *
 * The event payloads are the shapes PayPal documents for Payouts webhooks
 * (docs/11 §3), trimmed to the fields Kitty consumes. They are parsed by the
 * real `parsePaypalWebhookEvent` in `@kitty/paypal`, so a shape drift fails the
 * test rather than silently becoming an ignored event.
 */

export const TEST_INTENT_ID = "int_01JAYOUT0000000000000000";
export const TEST_BATCH_ID = "5B1234567890";
export const TEST_ITEM_ID = "8PSHPDWXNM6JY";
export const TEST_EVENT_ID = "WH-2WR32451HC0233532-67976317FL4543714";

export function payoutItemEventPayload(
  eventType: string,
  overrides: {
    eventId?: string;
    senderItemId?: string | null;
    itemId?: string;
    batchId?: string;
    transactionStatus?: string;
    amount?: string;
  } = {},
): unknown {
  const senderItemId =
    overrides.senderItemId === null ? undefined : (overrides.senderItemId ?? TEST_INTENT_ID);

  return {
    id: overrides.eventId ?? TEST_EVENT_ID,
    create_time: "2026-10-17T10:00:00Z",
    resource_type: "payouts_item",
    event_type: eventType,
    summary: "Payout item update",
    resource: {
      payout_item_id: overrides.itemId ?? TEST_ITEM_ID,
      transaction_id: "1X1234567890",
      transaction_status: overrides.transactionStatus ?? "SUCCESS",
      payout_batch_id: overrides.batchId ?? TEST_BATCH_ID,
      payout_item_fee: { currency: "USD", value: "0.25" },
      ...(senderItemId === undefined ? {} : { sender_item_id: senderItemId }),
      amount: { currency: "USD", value: overrides.amount ?? "1.00" },
      receiver: "vendor@example.com",
    },
  };
}

export function payoutBatchEventPayload(
  eventType: string,
  overrides: { eventId?: string; batchStatus?: string; batchId?: string } = {},
): unknown {
  return {
    id: overrides.eventId ?? "WH-BATCH-0001",
    create_time: "2026-10-17T10:00:00Z",
    resource_type: "payouts_batch",
    event_type: eventType,
    resource: {
      payout_batch_id: overrides.batchId ?? TEST_BATCH_ID,
      batch_status: overrides.batchStatus ?? "SUCCESS",
      sender_batch_header: { sender_batch_id: TEST_INTENT_ID },
      time_created: "2026-10-17T10:00:00Z",
      time_completed: "2026-10-17T10:00:05Z",
    },
  };
}

/** An invoice event: verified, stored, and ignored until KIT-22 handles it. */
export function unknownEventPayload(): unknown {
  return {
    id: "WH-INVOICE-0001",
    create_time: "2026-10-17T10:00:00Z",
    resource_type: "invoice",
    event_type: "INVOICING.INVOICE.PAID",
    resource: { id: "INV2-XYZ", status: "PAID" },
  };
}

/** A submitted payout intent, as `executeIntent` leaves it. */
export function fakeIntentRow(
  overrides: Partial<SpendIntentRow> & Pick<SpendIntentRow, "id">,
): SpendIntentRow {
  const at = new Date("2026-10-17T09:00:00.000Z");

  return {
    leashId: "lsh_test_webhook",
    agentId: "agt_shopper",
    action: "payout",
    amountCents: 100n,
    currency: "USD",
    payee: "vendor@example.com",
    category: "lodging",
    memo: "Deposit for Pine Hill Homestay",
    taskId: null,
    justification: "vendor deposit",
    requestHash: "hash",
    payloadHash: "payload-hash",
    decision: "ALLOW",
    reasons: [],
    status: "submitted",
    paypalRef: TEST_BATCH_ID,
    error: null,
    executeAttempts: 1,
    lastExecuteError: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export function payoutItem(overrides: Partial<PayoutItem> = {}): PayoutItem {
  return {
    itemId: TEST_ITEM_ID,
    status: "SUCCESS",
    batchId: TEST_BATCH_ID,
    senderItemId: TEST_INTENT_ID,
    amountCents: 100n,
    currency: "USD",
    ...overrides,
  };
}

export function payoutBatch(overrides: Partial<PayoutBatch> = {}): PayoutBatch {
  return {
    batchId: TEST_BATCH_ID,
    senderBatchId: TEST_INTENT_ID,
    status: "SUCCESS",
    createdAt: "2026-10-17T10:00:00Z",
    items: [payoutItem()],
    ...overrides,
  };
}

export interface FakePayoutStatusReader {
  readonly reader: PayoutStatusReader;
  /** Number of `getBatch` calls made. */
  calls(): number;
  respondWith(batch: PayoutBatch): void;
  failWith(error: unknown): void;
}

/** Fake {@link PayoutStatusReader} for the reconcile sweep tests. */
export function createFakePayoutStatusReader(
  initial: PayoutBatch = payoutBatch(),
): FakePayoutStatusReader {
  let next: { kind: "batch"; value: PayoutBatch } | { kind: "error"; value: unknown } = {
    kind: "batch",
    value: initial,
  };
  let count = 0;

  return {
    reader: {
      async getBatch() {
        count += 1;

        if (next.kind === "error") {
          throw next.value;
        }

        return next.value;
      },
    },
    calls: () => count,
    respondWith(value) {
      next = { kind: "batch", value };
    },
    failWith(value) {
      next = { kind: "error", value };
    },
  };
}
