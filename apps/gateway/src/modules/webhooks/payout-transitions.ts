import type { NewAuditEvent, NewOutbox, NewPaypalObject, SpendIntentRow } from "@kitty/db/schema";
import { release, settlePayout } from "@kitty/ledger";
import type { LedgerEntryInsert } from "../intents/intents.repository";

/**
 * The payout state machine of docs/05 §4, applied to the ledger (docs/05 §8).
 *
 * Both ways Kitty learns a payout's fate share these exact functions: the
 * webhook handlers (docs/11 §3) and the reconcile sweep (docs/10 §6). Each
 * transition runs inside the caller's transaction, so the intent row, its
 * `leash.ledger_entries` movement, its audit row and its outbox event commit
 * together or not at all.
 *
 * Guards are the safety net for out-of-order PayPal deliveries:
 * `settled` and `released` are terminal, and a retry of an event that already
 * applied is a no-op, never a second money movement (invariant #6 / I4).
 */

/** The writes a transition needs; `WebhooksTx` satisfies this. */
export interface IntentTransitionTx {
  updateIntentStatus(
    intentId: string,
    patch: {
      readonly status: SpendIntentRow["status"];
      readonly error?: Record<string, unknown> | null;
    },
  ): Promise<void>;
  insertLedgerEntry(entry: LedgerEntryInsert): Promise<void>;
  upsertPaypalObject(row: NewPaypalObject): Promise<void>;
  insertAuditEvent(row: NewAuditEvent): Promise<void>;
  insertOutboxEvent(row: NewOutbox): Promise<void>;
}

/** Where the facts came from: a live webhook, or the reconcile sweep. */
export type TransitionSource = "webhook" | "reconcile";

/** The PayPal facts a transition quotes in its audit row and outbox event. */
export interface PayoutItemFacts {
  readonly source: TransitionSource;
  /** PayPal `event_type`, or `sweep.reconcile` for the sweep. */
  readonly eventType: string;
  /** PayPal `transaction_status`, e.g. `SUCCESS`, `FAILED`, `RETURNED`. */
  readonly itemStatus: string;
  readonly itemId?: string;
  readonly batchId?: string;
  readonly transactionId?: string;
}

export interface SettleIntentContext {
  readonly intent: SpendIntentRow;
  readonly kittyId: string;
  readonly facts: PayoutItemFacts;
}

export type SettleOutcome = "settled" | "noop";

export interface FailIntentContext extends SettleIntentContext {
  /** Stable machine code recorded on the intent and the outbox event. */
  readonly reason: string;
}

export type FailOutcome = "released" | "noop";

/** Terminal states (docs/05 §4): nothing may move an intent out of them. */
export function isTerminalIntentStatus(status: SpendIntentRow["status"]): boolean {
  return status === "settled" || status === "released";
}

function factsPayload(context: SettleIntentContext): Record<string, unknown> {
  return {
    source: context.facts.source,
    eventType: context.facts.eventType,
    itemStatus: context.facts.itemStatus,
    paypalItemId: context.facts.itemId ?? null,
    batchId: context.facts.batchId ?? null,
    transactionId: context.facts.transactionId ?? null,
  };
}

/** `submitted` → `settled`: `leash:{id}:held` → `external:payee:{email}` (docs/05 §8). */
export async function settleIntent(
  tx: IntentTransitionTx,
  context: SettleIntentContext,
): Promise<SettleOutcome> {
  const { intent, kittyId } = context;

  // Only a submitted intent can settle; an already-settled one (duplicate
  // delivery) and anything else stays untouched.
  if (intent.status !== "submitted") {
    return "noop";
  }

  const payeeEmail = intent.payee;

  if (payeeEmail === null) {
    // A payout intent always has a payee (policy requires one); a null here is a
    // data bug, so refuse rather than move money to an unknown account.
    throw new Error(`intent ${intent.id} settled without a payee`);
  }

  await tx.updateIntentStatus(intent.id, { status: "settled", error: null });
  await tx.insertLedgerEntry({
    kittyId,
    txn: settlePayout({
      txnId: `txn_settle_${intent.id}`,
      leashId: intent.leashId,
      payeeEmail,
      amountCents: intent.amountCents,
      intentId: intent.id,
    }),
  });
  await tx.insertAuditEvent({
    kittyId,
    actor: "paypal",
    type: "intent.settled",
    data: {
      intentId: intent.id,
      leashId: intent.leashId,
      payee: payeeEmail,
      ...factsPayload(context),
    },
  });
  await tx.insertOutboxEvent({
    kittyId,
    type: "leash.intent_settled",
    payload: {
      intentId: intent.id,
      leashId: intent.leashId,
      payee: payeeEmail,
      ...factsPayload(context),
    },
  });

  return "settled";
}

/**
 * `submitted` → `failed` → `released`: the hold goes back to the leash
 * (`leash:{id}:held` → `leash:{id}:available`, docs/05 §8). `released` is the
 * stored terminal status; `failed` is the transient step of the diagram.
 */
export async function failIntent(
  tx: IntentTransitionTx,
  context: FailIntentContext,
): Promise<FailOutcome> {
  const { intent, kittyId, reason } = context;

  if (intent.status !== "submitted") {
    return "noop";
  }

  await tx.updateIntentStatus(intent.id, {
    status: "released",
    error: { code: reason, ...factsPayload(context) },
  });
  await tx.insertLedgerEntry({
    kittyId,
    txn: release({
      txnId: `txn_release_${intent.id}`,
      leashId: intent.leashId,
      amountCents: intent.amountCents,
      intentId: intent.id,
    }),
  });
  await tx.insertAuditEvent({
    kittyId,
    actor: "paypal",
    type: "intent.released",
    data: { intentId: intent.id, leashId: intent.leashId, reason, ...factsPayload(context) },
  });
  await tx.insertOutboxEvent({
    kittyId,
    type: "leash.intent_failed",
    payload: { intentId: intent.id, leashId: intent.leashId, reason, ...factsPayload(context) },
  });

  return "released";
}

/**
 * Records a PayPal condition that changes no money and moves no state, so an
 * organizer can see it (docs/11 §3: `UNCLAIMED` is a warning; a `RETURNED`
 * after settlement is an alert — see the open question in docs/20).
 */
export async function insertPayoutAlert(
  tx: IntentTransitionTx,
  context: SettleIntentContext & { readonly type: string },
): Promise<void> {
  await tx.insertAuditEvent({
    kittyId: context.kittyId,
    actor: "paypal",
    type: context.type,
    data: {
      intentId: context.intent.id,
      leashId: context.intent.leashId,
      intentStatus: context.intent.status,
      amountCents: context.intent.amountCents.toString(),
      ...factsPayload(context),
    },
  });
}

/** Records the last known state of a PayPal object; never touches the ledger. */
export async function recordPaypalObject(
  tx: IntentTransitionTx,
  row: NewPaypalObject,
): Promise<void> {
  await tx.upsertPaypalObject(row);
}
