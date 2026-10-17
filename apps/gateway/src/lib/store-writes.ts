import {
  type NewAuditEvent,
  type NewOutbox,
  type NewPaypalObject,
  auditEvents,
  outbox,
  paypalObjects,
} from "@kitty/db/schema";
import type { LedgerTxn } from "@kitty/ledger";
import { sql } from "drizzle-orm";
import type { DbLike } from "./db-types";
import { postLedgerTxn } from "./ledger";

/**
 * The four writes every money-path repository shares
 * (CODE_RULES.md §D: repositories hold queries, services own the transaction).
 *
 * They live here so the reserve/execute flow (KIT-16) and the webhook flow
 * (KIT-7) can never drift on how a ledger transaction, a PayPal object, an
 * audit row or an outbox event is recorded. Always called inside the service's
 * transaction so a state change, its ledger movement and its audit row commit
 * together (AGENTS.md §3).
 */

/** Posts a `@kitty/ledger` transaction into `leash.ledger_entries` (docs/05 §8). */
export async function insertLedgerTxn(
  db: DbLike,
  input: { readonly kittyId: string; readonly txn: LedgerTxn },
): Promise<void> {
  // `ref` is the intent (or contribution) id so I4 can be checked per intent.
  await postLedgerTxn(db, input.txn, input.kittyId, { ref: input.txn.intentId ?? input.txn.txnId });
}

/** Inserts or refreshes the last known PayPal state of one object (docs/09 §3.2). */
export async function upsertPaypalObject(db: DbLike, row: NewPaypalObject): Promise<void> {
  await db
    .insert(paypalObjects)
    .values(row)
    .onConflictDoUpdate({
      target: [paypalObjects.kind, paypalObjects.id],
      set: { status: row.status, raw: row.raw, updatedAt: sql`now()` },
    });
}

/** Appends one audit event (`leash.audit_events` is append-only). */
export async function insertAuditEvent(db: DbLike, row: NewAuditEvent): Promise<void> {
  await db.insert(auditEvents).values(row);
}

/** Appends one transactional-outbox domain event (docs/06 §6). */
export async function insertOutboxEvent(db: DbLike, row: NewOutbox): Promise<void> {
  await db.insert(outbox).values(row);
}
