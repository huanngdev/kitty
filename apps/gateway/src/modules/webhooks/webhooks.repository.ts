import type { Db } from "@kitty/db";
import {
  type NewAuditEvent,
  type NewOutbox,
  type NewPaypalObject,
  type SpendIntentRow,
  spendIntents,
  webhookEvents,
} from "@kitty/db/schema";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { DbTx } from "../../lib/db-types";
import {
  insertAuditEvent,
  insertLedgerTxn,
  insertOutboxEvent,
  upsertPaypalObject,
} from "../../lib/store-writes";
import { findLeashById } from "../leashes/leashes.repository";
import type { IntentWithKitty, LedgerEntryInsert } from "../intents/intents.repository";
import type { WebhookEventStatus } from "@kitty/db/schema";

/**
 * Drizzle-only data access for the webhook handlers and the reconcile sweep
 * (CODE_RULES.md §D). Every method takes the current transaction so the service
 * controls atomicity: one PayPal event becomes at most one commit.
 */

/** A verified PayPal event, as stored in `leash.webhook_events`. */
export interface WebhookEventInsert {
  readonly id: string;
  readonly eventType: string;
  readonly resourceId: string | null;
  readonly payload: unknown;
}

/** How the handler finished with an event (written to `webhook_events`). */
export interface WebhookEventVerdict {
  readonly status: Exclude<WebhookEventStatus, "received">;
  readonly error?: string | null;
}

/** Every query the webhook / reconcile services need, grouped per transaction. */
export interface WebhooksTx {
  /**
   * Stores the verified event, deduped by PayPal event id. Returns `false` when
   * the id was already stored — a duplicate delivery (docs/11 §4).
   */
  insertWebhookEvent(row: WebhookEventInsert): Promise<boolean>;
  /** Marks a stored event processed / ignored / failed. */
  recordWebhookVerdict(eventId: string, verdict: WebhookEventVerdict): Promise<void>;
  /**
   * Locks one intent row `FOR UPDATE` and reads its kitty, so an event can only
   * move the intent it locked. Returns `null` when the intent does not exist.
   */
  lockIntentById(intentId: string): Promise<IntentWithKitty | null>;
  /**
   * Locks every `submitted` intent of one payout batch, for a batch event that
   * has no item details (docs/11 §3).
   */
  lockSubmittedIntentsByBatch(batchId: string): Promise<IntentWithKitty[]>;
  /** Intents still `submitted` after `updatedBefore`, oldest first (the sweep). */
  listStaleSubmittedIntents(input: {
    readonly updatedBefore: Date;
    readonly limit: number;
  }): Promise<IntentWithKitty[]>;
  /** Applies a status change to a row this transaction already locked. */
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

export interface WebhooksStore {
  transaction<T>(fn: (tx: WebhooksTx) => Promise<T>): Promise<T>;
}

function toTx(db: DbTx): WebhooksTx {
  async function kittyIdOfLeash(leashId: string): Promise<string | null> {
    const leash = await findLeashById(db, leashId);

    return leash?.kittyId ?? null;
  }

  async function withKitty(rows: readonly SpendIntentRow[]): Promise<IntentWithKitty[]> {
    const result: IntentWithKitty[] = [];

    for (const intent of rows) {
      const kittyId = await kittyIdOfLeash(intent.leashId);

      if (kittyId !== null) {
        result.push({ intent, kittyId });
      }
    }

    return result;
  }

  return {
    async insertWebhookEvent(row) {
      const inserted = await db
        .insert(webhookEvents)
        .values({ ...row, verified: true })
        .onConflictDoNothing({ target: webhookEvents.id })
        .returning({ id: webhookEvents.id });

      return inserted.length > 0;
    },

    async recordWebhookVerdict(eventId, verdict) {
      await db
        .update(webhookEvents)
        .set({
          status: verdict.status,
          error: verdict.error ?? null,
          processedAt: sql`now()`,
        })
        .where(eq(webhookEvents.id, eventId));
    },

    async lockIntentById(intentId) {
      const rows = await db
        .select()
        .from(spendIntents)
        .where(eq(spendIntents.id, intentId))
        .limit(1)
        // No join, so this locks exactly the intent row: the leashes row is
        // read separately and never written here.
        .for("update");

      const intent = rows[0];
      if (intent === undefined) {
        return null;
      }

      const kittyId = await kittyIdOfLeash(intent.leashId);

      return kittyId === null ? null : { intent, kittyId };
    },

    async lockSubmittedIntentsByBatch(batchId) {
      // Lock the intents first, then read their kitty: Postgres rejects
      // `FOR UPDATE OF` with a schema-qualified relation name, and locking one
      // table keeps the webhook's lock footprint to exactly the rows it moves.
      const rows = await db
        .select()
        .from(spendIntents)
        .where(and(eq(spendIntents.paypalRef, batchId), eq(spendIntents.status, "submitted")))
        .orderBy(asc(spendIntents.id))
        .for("update");

      return withKitty(rows);
    },

    async listStaleSubmittedIntents(input) {
      const rows = await db
        .select()
        .from(spendIntents)
        .where(
          and(
            eq(spendIntents.status, "submitted"),
            lte(spendIntents.updatedAt, input.updatedBefore),
          ),
        )
        .orderBy(asc(spendIntents.updatedAt))
        .limit(input.limit);

      return withKitty(rows);
    },

    async updateIntentStatus(intentId, patch) {
      const set: Record<string, unknown> = { status: patch.status, updatedAt: sql`now()` };

      if (patch.error !== undefined) {
        set.error = patch.error;
      }

      await db.update(spendIntents).set(set).where(eq(spendIntents.id, intentId));
    },

    async insertLedgerEntry(entry) {
      await insertLedgerTxn(db, entry);
    },

    async upsertPaypalObject(row) {
      await upsertPaypalObject(db, row);
    },

    async insertAuditEvent(row) {
      await insertAuditEvent(db, row);
    },

    async insertOutboxEvent(row) {
      await insertOutboxEvent(db, row);
    },
  };
}

/** Builds the production store backed by a Drizzle client. */
export function createDrizzleWebhooksStore(db: Db): WebhooksStore {
  return {
    transaction: (fn) => db.transaction((tx) => fn(toTx(tx))),
  };
}
