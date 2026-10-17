import type { Db } from "@kitty/db";
import {
  type LeashRow,
  type NewApproval,
  type NewAuditEvent,
  type NewOutbox,
  type NewPaypalObject,
  type NewSpendIntent,
  type SpendIntentRow,
  approvals,
  auditEvents,
  leashes,
  outbox,
  paypalObjects,
  spendIntents,
} from "@kitty/db/schema";
import type { LeashBalance, LedgerTxn } from "@kitty/ledger";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DbTx } from "../../lib/db-types";
import { postLedgerTxn } from "../../lib/ledger";
import {
  findActiveLeashByAgent,
  findLeashById,
  leashBalancesByKitty,
  listLeashesByKitty,
} from "../leashes/leashes.repository";
import type { IntentUsageRow, LeashIdentity } from "./usage";

/**
 * Drizzle-only data access for the reserve/execute flow (CODE_RULES.md §D:
 * repositories hold queries and nothing else). Every method takes the current
 * transaction so the service controls atomicity.
 *
 * Where a query already exists for the Admin API it is **reused** from
 * `modules/leashes/leashes.repository.ts` and the shared ledger writer
 * `lib/ledger.ts`, so the two APIs can never drift apart.
 */

/** A spend intent row plus the kitty it belongs to (the row has no `kitty_id`). */
export interface IntentWithKitty {
  readonly intent: SpendIntentRow;
  readonly kittyId: string;
}

export interface LedgerEntryInsert {
  readonly kittyId: string;
  readonly txn: LedgerTxn;
}

/** Every query the intents service needs, grouped per transaction. */
export interface IntentsTx {
  findIntentById(intentId: string): Promise<IntentWithKitty | null>;
  findActiveLeashForAgent(agentId: string): Promise<LeashRow | null>;
  findAncestorChain(leashId: string): Promise<LeashRow[]>;
  lockLeashes(leashIds: readonly string[]): Promise<LeashRow[]>;
  listLeashesForKitty(kittyId: string): Promise<LeashIdentity[]>;
  listIntentUsageRows(kittyId: string, since: Date): Promise<IntentUsageRow[]>;
  listLeashBalances(kittyId: string): Promise<Map<string, LeashBalance>>;
  insertIntent(row: NewSpendIntent): Promise<boolean>;
  insertLedgerEntry(entry: LedgerEntryInsert): Promise<void>;
  insertApproval(row: NewApproval): Promise<void>;
  insertAuditEvent(row: NewAuditEvent): Promise<void>;
  insertOutboxEvent(row: NewOutbox): Promise<void>;
  upsertPaypalObject(row: NewPaypalObject): Promise<void>;
  kittyIdOfLeash(leashId: string): Promise<string | null>;
  lockReservedIntent(intentId: string): Promise<SpendIntentRow | null>;
  incrementExecuteAttempts(intentId: string): Promise<void>;
  setLastExecuteError(intentId: string, error: Record<string, unknown> | null): Promise<void>;
  /**
   * Applies the result of an execution, but only while the intent is still
   * `reserved` — a status change made in the meantime (for example by a
   * webhook) is never clobbered. Returns false when nothing was updated.
   */
  updateIntentAfterExecute(
    intentId: string,
    patch: {
      status: SpendIntentRow["status"];
      paypalRef?: string | null;
      error?: Record<string, unknown> | null;
    },
  ): Promise<boolean>;
}

export interface IntentsStore {
  transaction<T>(fn: (tx: IntentsTx) => Promise<T>): Promise<T>;
}

function toTx(db: DbTx): IntentsTx {
  return {
    async findIntentById(intentId) {
      const rows = await db
        .select({ intent: spendIntents, kittyId: leashes.kittyId })
        .from(spendIntents)
        .innerJoin(leashes, eq(spendIntents.leashId, leashes.id))
        .where(eq(spendIntents.id, intentId))
        .limit(1);

      const row = rows[0];

      return row === undefined ? null : { intent: row.intent, kittyId: row.kittyId };
    },

    async findActiveLeashForAgent(agentId) {
      return (await findActiveLeashByAgent(db, agentId)) ?? null;
    },

    async findAncestorChain(leashId) {
      const chain: LeashRow[] = [];
      let current = await findLeashById(db, leashId);

      // Depth is bounded (delegation is max 2 levels, docs/05 §9); the guard
      // only protects against a corrupted parent pointer.
      for (let depth = 0; depth < 8 && current?.parentId != null; depth += 1) {
        const parent = await findLeashById(db, current.parentId);

        if (parent === undefined) {
          break;
        }

        chain.push(parent);
        current = parent;
      }

      return chain;
    },

    async lockLeashes(leashIds) {
      if (leashIds.length === 0) {
        return [];
      }

      // Ordered by id so concurrent reservations always take locks in the same
      // order and cannot deadlock (docs/05 §7).
      return db
        .select()
        .from(leashes)
        .where(inArray(leashes.id, [...leashIds]))
        .orderBy(asc(leashes.id))
        .for("update");
    },

    async listLeashesForKitty(kittyId) {
      const rows = await listLeashesByKitty(db, kittyId);

      return rows.map((row) => ({ id: row.id, parentId: row.parentId }));
    },

    async listIntentUsageRows(kittyId, since) {
      return db
        .select({
          intentId: spendIntents.id,
          leashId: spendIntents.leashId,
          payee: spendIntents.payee,
          amountCents: spendIntents.amountCents,
          decision: spendIntents.decision,
          status: spendIntents.status,
          createdAt: spendIntents.createdAt,
        })
        .from(spendIntents)
        .innerJoin(leashes, eq(spendIntents.leashId, leashes.id))
        .where(and(eq(leashes.kittyId, kittyId), gte(spendIntents.createdAt, since)));
    },

    async listLeashBalances(kittyId) {
      const balances = await leashBalancesByKitty(db, kittyId);

      return new Map(
        [...balances].map(([leashId, balance]) => [
          leashId,
          { availableCents: balance.availableCents, heldCents: balance.heldCents },
        ]),
      );
    },

    async insertIntent(row) {
      const inserted = await db
        .insert(spendIntents)
        .values(row)
        .onConflictDoNothing({ target: spendIntents.id })
        .returning({ id: spendIntents.id });

      return inserted.length > 0;
    },

    async insertLedgerEntry({ kittyId, txn }) {
      // Reuses the single ledger writer so `kind`/`ref` stay consistent with
      // the Admin API's own movements (docs/09 §3.2).
      await postLedgerTxn(db, txn, kittyId, { ref: txn.intentId ?? txn.txnId });
    },

    async insertApproval(row) {
      await db.insert(approvals).values(row);
    },

    async insertAuditEvent(row) {
      await db.insert(auditEvents).values(row);
    },

    async insertOutboxEvent(row) {
      await db.insert(outbox).values(row);
    },

    async upsertPaypalObject(row) {
      await db
        .insert(paypalObjects)
        .values(row)
        .onConflictDoUpdate({
          target: [paypalObjects.kind, paypalObjects.id],
          set: { status: row.status, raw: row.raw, updatedAt: sql`now()` },
        });
    },

    async kittyIdOfLeash(leashId) {
      const leash = await findLeashById(db, leashId);

      return leash?.kittyId ?? null;
    },

    async lockReservedIntent(intentId) {
      const rows = await db
        .select()
        .from(spendIntents)
        .where(and(eq(spendIntents.id, intentId), eq(spendIntents.status, "reserved")))
        .limit(1)
        .for("update", { skipLocked: true });

      return rows[0] ?? null;
    },

    async incrementExecuteAttempts(intentId) {
      await db
        .update(spendIntents)
        .set({
          executeAttempts: sql`${spendIntents.executeAttempts} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(spendIntents.id, intentId));
    },

    async setLastExecuteError(intentId, error) {
      await db
        .update(spendIntents)
        .set({ lastExecuteError: error, updatedAt: sql`now()` })
        .where(eq(spendIntents.id, intentId));
    },

    async updateIntentAfterExecute(intentId, patch) {
      const set: Record<string, unknown> = { status: patch.status, updatedAt: sql`now()` };

      if (patch.paypalRef !== undefined) {
        set.paypalRef = patch.paypalRef;
      }
      if (patch.error !== undefined) {
        set.error = patch.error;
      }

      const updated = await db
        .update(spendIntents)
        .set(set)
        .where(and(eq(spendIntents.id, intentId), eq(spendIntents.status, "reserved")))
        .returning({ id: spendIntents.id });

      return updated.length > 0;
    },
  };
}

/** Builds the production store backed by a Drizzle client. */
export function createDrizzleIntentsStore(db: Db): IntentsStore {
  return {
    transaction: (fn) => db.transaction((tx) => fn(toTx(tx))),
  };
}
