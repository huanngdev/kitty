import type { NewPaypalObject, SpendIntentRow } from "@kitty/db/schema";
import type { PaypalWebhookEvent } from "@kitty/paypal";
import type { WebhookEventStatusDto } from "@kitty/shared";
import { centsToWire } from "../../lib/money";
import { logger } from "../../lib/logger";
import type { IntentWithKitty } from "../intents/intents.repository";
import {
  failIntent,
  insertPayoutAlert,
  recordPaypalObject,
  settleIntent,
  type PayoutItemFacts,
} from "./payout-transitions";
import type { WebhooksStore, WebhooksTx } from "./webhooks.repository";

/**
 * Webhook dispatch (docs/10 §5, docs/11 §3).
 *
 * One verified event is stored and handled in a **single transaction**: the
 * insert dedupes by PayPal event id, so a redelivery can never settle twice,
 * and a handler failure rolls the whole event back so PayPal's retry re-runs it.
 * State changes go through {@link settleIntent} / {@link failIntent}, the same
 * functions the reconcile sweep uses.
 */

/** PayPal item statuses that end a payout item. */
const SUCCEEDED_ITEM_STATUS = "SUCCESS";
const FAILED_ITEM_STATUSES = ["FAILED", "BLOCKED", "DENIED"] as const;
const RETURNED_ITEM_STATUS = "RETURNED";
const REFUNDED_ITEM_STATUS = "REFUNDED";
const UNCLAIMED_ITEM_STATUS = "UNCLAIMED";
const PENDING_ITEM_STATUSES = ["PENDING", "ONHOLD"] as const;

/** PayPal batch statuses that mean the whole batch failed (docs/11 §3). */
const FAILED_BATCH_STATUSES = ["DENIED", "CANCELED", "FAILED"] as const;

export interface WebhookHandleResult {
  /** True when this event id had already been stored: nothing was re-applied. */
  readonly duplicate: boolean;
  readonly status: WebhookEventStatusDto;
}

export interface WebhooksService {
  handleEvent(event: PaypalWebhookEvent): Promise<WebhookHandleResult>;
}

export interface WebhooksServiceDeps {
  readonly store: WebhooksStore;
}

interface DispatchVerdict {
  readonly status: Exclude<WebhookEventStatusDto, "received">;
  readonly error: string | null;
}

/** `resource_id` column value for an already normalised event. */
function resourceIdOf(event: PaypalWebhookEvent): string | null {
  switch (event.kind) {
    case "payout_item":
      return event.itemId;
    case "payout_batch":
      return event.batchId;
    case "other":
    case "malformed":
      return event.resourceId ?? null;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function factsFor(event: {
  readonly eventType: string;
  readonly itemStatus: string;
  readonly itemId?: string;
  readonly batchId?: string;
  readonly transactionId?: string;
}): PayoutItemFacts {
  return {
    source: "webhook",
    eventType: event.eventType,
    itemStatus: event.itemStatus,
    itemId: event.itemId,
    batchId: event.batchId,
    transactionId: event.transactionId,
  };
}

/** PII-free snapshot of one payout item for `leash.paypal_objects.raw`. */
function payoutItemObject(
  found: IntentWithKitty,
  event: {
    readonly itemId: string;
    readonly itemStatus: string;
    readonly batchId?: string;
    readonly transactionId?: string;
    readonly senderItemId?: string;
    readonly amountCents?: bigint;
    readonly currency?: string;
  },
): NewPaypalObject {
  return {
    id: event.itemId,
    kind: "payout_item",
    intentId: found.intent.id,
    kittyId: found.kittyId,
    status: event.itemStatus,
    raw: {
      payoutItemId: event.itemId,
      transactionStatus: event.itemStatus,
      payoutBatchId: event.batchId ?? null,
      senderItemId: event.senderItemId ?? null,
      transactionId: event.transactionId ?? null,
      amount: event.amountCents === undefined ? null : centsToWire(event.amountCents),
      currency: event.currency ?? null,
    },
  };
}

function isFailedItemStatus(status: string): boolean {
  return (FAILED_ITEM_STATUSES as readonly string[]).includes(status);
}

function isPendingItemStatus(status: string): boolean {
  return (PENDING_ITEM_STATUSES as readonly string[]).includes(status);
}

function isFailedBatchStatus(status: string): boolean {
  return (FAILED_BATCH_STATUSES as readonly string[]).includes(status);
}

async function handlePayoutItem(
  tx: WebhooksTx,
  event: Extract<PaypalWebhookEvent, { kind: "payout_item" }>,
): Promise<DispatchVerdict> {
  const senderItemId = event.senderItemId;

  if (senderItemId === undefined) {
    return { status: "failed", error: "payout item event carries no sender_item_id" };
  }

  const found = await tx.lockIntentById(senderItemId);

  if (found === null) {
    logger.warn(
      { eventId: event.eventId, senderItemId },
      "payout item event for an unknown intent",
    );

    return { status: "failed", error: `no spend intent for sender_item_id ${senderItemId}` };
  }

  const intent: SpendIntentRow = found.intent;
  // Record what PayPal said before applying it, so `paypal_objects` always
  // shows the last known item state — including a warning state that changes
  // nothing (UNCLAIMED).
  await recordPaypalObject(tx, payoutItemObject(found, event));

  const facts = factsFor(event);
  const context = { intent, kittyId: found.kittyId, facts };

  if (event.itemStatus === SUCCEEDED_ITEM_STATUS) {
    const outcome = await settleIntent(tx, context);

    return outcome === "settled"
      ? { status: "processed", error: null }
      : { status: "ignored", error: `intent ${intent.id} is ${intent.status}` };
  }

  if (isFailedItemStatus(event.itemStatus)) {
    const outcome = await failIntent(tx, {
      ...context,
      reason: `PAYPAL_ITEM_${event.itemStatus}`,
    });

    return outcome === "released"
      ? { status: "processed", error: null }
      : { status: "ignored", error: `intent ${intent.id} is ${intent.status}` };
  }

  if (event.itemStatus === RETURNED_ITEM_STATUS || event.itemStatus === REFUNDED_ITEM_STATUS) {
    // A return/refund of money that already settled cannot be undone in the
    // local ledger — the payee account is external. Record and alert; the
    // manual path is an open question in docs/20.
    if (intent.status === "settled") {
      await insertPayoutAlert(tx, {
        ...context,
        type:
          event.itemStatus === RETURNED_ITEM_STATUS
            ? "intent.returned_after_settled"
            : "intent.refunded_after_settled",
      });

      return { status: "processed", error: null };
    }

    const outcome = await failIntent(tx, {
      ...context,
      reason: `PAYPAL_ITEM_${event.itemStatus}`,
    });

    return outcome === "released"
      ? { status: "processed", error: null }
      : { status: "ignored", error: `intent ${intent.id} is ${intent.status}` };
  }

  if (event.itemStatus === UNCLAIMED_ITEM_STATUS) {
    // The receiver has not claimed the payment yet; the hold stays put until
    // the organizer cancels it (docs/11 §2.3).
    await insertPayoutAlert(tx, { ...context, type: "intent.unclaimed" });

    return { status: "processed", error: null };
  }

  if (isPendingItemStatus(event.itemStatus)) {
    return { status: "ignored", error: `item is ${event.itemStatus}` };
  }

  await insertPayoutAlert(tx, { ...context, type: "intent.unknown_item_status" });

  return { status: "failed", error: `unrecognised payout item status ${event.itemStatus}` };
}

async function handlePayoutBatch(
  tx: WebhooksTx,
  event: Extract<PaypalWebhookEvent, { kind: "payout_batch" }>,
): Promise<DispatchVerdict> {
  const candidates = await tx.lockSubmittedIntentsByBatch(event.batchId);

  for (const found of candidates) {
    await recordPaypalObject(tx, {
      id: event.batchId,
      kind: "payout_batch",
      intentId: found.intent.id,
      kittyId: found.kittyId,
      status: event.batchStatus,
      raw: {
        payoutBatchId: event.batchId,
        batchStatus: event.batchStatus,
        senderBatchId: event.senderBatchId ?? null,
      },
    });
  }

  if (!isFailedBatchStatus(event.batchStatus)) {
    // `SUCCESS` batches carry no item detail; the item events (or the reconcile
    // sweep) settle each intent. Nothing to move here.
    return { status: candidates.length === 0 ? "ignored" : "processed", error: null };
  }

  if (candidates.length === 0) {
    return { status: "failed", error: `no submitted intent for batch ${event.batchId}` };
  }

  let released = 0;

  for (const found of candidates) {
    const outcome = await failIntent(tx, {
      intent: found.intent,
      kittyId: found.kittyId,
      reason: `PAYPAL_BATCH_${event.batchStatus}`,
      facts: {
        source: "webhook",
        eventType: event.eventType,
        itemStatus: event.batchStatus,
        batchId: event.batchId,
      },
    });

    if (outcome === "released") {
      released += 1;
    }
  }

  return {
    status: "processed",
    error: `batch ${event.batchStatus} released ${released} intent(s)`,
  };
}

async function dispatch(tx: WebhooksTx, event: PaypalWebhookEvent): Promise<DispatchVerdict> {
  switch (event.kind) {
    case "payout_item":
      return handlePayoutItem(tx, event);
    case "payout_batch":
      return handlePayoutBatch(tx, event);
    case "other":
      // Invoice, order, capture and refund handlers land in KIT-22/KIT-27/KIT-42.
      return { status: "ignored", error: null };
    case "malformed":
      return { status: "failed", error: `malformed resource for ${event.eventType}` };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export function createWebhooksService(deps: WebhooksServiceDeps): WebhooksService {
  return {
    async handleEvent(event) {
      return deps.store.transaction(async (tx) => {
        const stored = await tx.insertWebhookEvent({
          id: event.eventId,
          eventType: event.eventType,
          resourceId: resourceIdOf(event),
          payload: event.raw,
        });

        if (!stored) {
          logger.info({ eventId: event.eventId }, "duplicate PayPal webhook delivery");

          return { duplicate: true, status: "ignored" };
        }

        const verdict = await dispatch(tx, event);
        await tx.recordWebhookVerdict(event.eventId, {
          status: verdict.status,
          error: verdict.error,
        });

        return { duplicate: false, status: verdict.status };
      });
    },
  };
}
