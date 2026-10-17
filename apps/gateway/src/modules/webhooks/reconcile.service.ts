import type { PayoutBatch, PayoutItem } from "@kitty/paypal";
import type { ReconcileSweepResponse } from "@kitty/shared";
import { logger } from "../../lib/logger";
import { centsToWire } from "../../lib/money";
import type { PayoutStatusReader } from "../../lib/paypal";
import { failIntent, recordPaypalObject, settleIntent } from "./payout-transitions";
import type { WebhooksStore } from "./webhooks.repository";

/**
 * The reconcile sweep (docs/10 §6, docs/11 §4): the webhook fallback.
 *
 * Intents stuck in `submitted` longer than `olderThanMinutes` are polled from
 * PayPal and pushed through the **same** settle/release transitions the webhook
 * handlers use, so Kitty settles locally even without a public HTTPS callback
 * URL. PayPal is read with no transaction open; every state change then takes
 * the intent row lock again and re-checks the status, so a webhook that lands
 * concurrently wins and the sweep becomes a no-op.
 */

const SUCCEEDED_ITEM_STATUS = "SUCCESS";
const FAILED_ITEM_STATUSES = ["FAILED", "BLOCKED", "DENIED", "RETURNED", "REFUNDED"] as const;
const FAILED_BATCH_STATUSES = ["DENIED", "CANCELED", "FAILED"] as const;

export interface ReconcileService {
  reconcile(input: {
    readonly olderThanMinutes: number;
    readonly limit: number;
  }): Promise<ReconcileSweepResponse>;
}

export interface ReconcileServiceDeps {
  readonly store: WebhooksStore;
  readonly payouts: PayoutStatusReader;
  readonly now: () => Date;
}

/** The item of a batch that belongs to `intentId`: `sender_item_id` is the key. */
function itemForIntent(batch: PayoutBatch, intentId: string): PayoutItem | undefined {
  const match = batch.items.find((item) => item.senderItemId === intentId);

  if (match !== undefined) {
    return match;
  }

  // 1 intent = 1 batch = 1 item (docs/11 §2.3); fall back to the single item
  // so a payout created before `sender_item_id` was wired still reconciles.
  return batch.items.length === 1 ? batch.items[0] : undefined;
}

function isFailedBatch(status: string | undefined): boolean {
  return status !== undefined && (FAILED_BATCH_STATUSES as readonly string[]).includes(status);
}

function isFailedItem(status: string | undefined): boolean {
  return status !== undefined && (FAILED_ITEM_STATUSES as readonly string[]).includes(status);
}

export function createReconcileService(deps: ReconcileServiceDeps): ReconcileService {
  async function applyToIntent(input: {
    readonly intentId: string;
    readonly batch: PayoutBatch;
    readonly item: PayoutItem | undefined;
  }): Promise<"settled" | "released" | "unchanged" | "stale"> {
    const { intentId, batch, item } = input;
    const itemStatus = item?.status;
    const facts = {
      source: "reconcile" as const,
      eventType: "sweep.reconcile",
      itemStatus: itemStatus ?? batch.status ?? "UNKNOWN",
      itemId: item?.itemId,
      batchId: batch.batchId,
    };

    const decide = (): "settle" | "fail" | "none" => {
      if (itemStatus === SUCCEEDED_ITEM_STATUS) {
        return "settle";
      }
      if (isFailedItem(itemStatus)) {
        return "fail";
      }
      if (isFailedBatch(batch.status)) {
        return "fail";
      }
      return "none";
    };

    const action = decide();

    if (action === "none") {
      return "unchanged";
    }

    return deps.store.transaction(async (tx) => {
      const found = await tx.lockIntentById(intentId);

      // Whatever happened in the meantime (a webhook, another sweep) wins: the
      // sweep only acts on a row that is still `submitted`.
      if (found === null || found.intent.status !== "submitted") {
        return "stale";
      }

      if (item !== undefined) {
        await recordPaypalObject(tx, {
          id: item.itemId,
          kind: "payout_item",
          intentId: found.intent.id,
          kittyId: found.kittyId,
          status: item.status,
          raw: {
            payoutItemId: item.itemId,
            transactionStatus: item.status,
            payoutBatchId: item.batchId ?? batch.batchId ?? null,
            senderItemId: item.senderItemId ?? null,
            amount: item.amountCents === undefined ? null : centsToWire(item.amountCents),
            currency: item.currency ?? null,
          },
        });
      }

      const context = { intent: found.intent, kittyId: found.kittyId, facts };

      if (action === "settle") {
        return (await settleIntent(tx, context)) === "settled" ? "settled" : "stale";
      }

      const reason =
        itemStatus !== undefined && isFailedItem(itemStatus)
          ? `PAYPAL_ITEM_${itemStatus}`
          : `PAYPAL_BATCH_${batch.status ?? "FAILED"}`;

      return (await failIntent(tx, { ...context, reason })) === "released" ? "released" : "stale";
    });
  }

  return {
    async reconcile(input) {
      const updatedBefore = new Date(deps.now().getTime() - input.olderThanMinutes * 60_000);
      const candidates = await deps.store.transaction((tx) =>
        tx.listStaleSubmittedIntents({ updatedBefore, limit: input.limit }),
      );

      let settled = 0;
      let failed = 0;
      let unchanged = 0;
      let errored = 0;

      for (const candidate of candidates) {
        const batchId = candidate.intent.paypalRef;

        if (batchId === null) {
          errored += 1;
          logger.warn(
            { intentId: candidate.intent.id },
            "submitted intent has no paypal batch id to reconcile",
          );
          continue;
        }

        let batch: PayoutBatch;

        try {
          batch = await deps.payouts.getBatch({ batchId });
        } catch (error) {
          errored += 1;
          logger.warn({ err: error, intentId: candidate.intent.id }, "reconcile read failed");
          continue;
        }

        const outcome = await applyToIntent({
          intentId: candidate.intent.id,
          batch,
          item: itemForIntent(batch, candidate.intent.id),
        });

        if (outcome === "settled") {
          settled += 1;
        } else if (outcome === "released") {
          failed += 1;
        } else {
          unchanged += 1;
        }
      }

      return { scanned: candidates.length, settled, failed, unchanged, errored };
    },
  };
}
