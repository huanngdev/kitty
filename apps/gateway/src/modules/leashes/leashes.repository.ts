import {
  type LeashRow,
  type NewLeash,
  type SpendIntentRow,
  leashes,
  ledgerEntries,
  leashBalances,
  spendIntents,
} from "@kitty/db";
import type { LeashStatus } from "@kitty/leash";
import { accountKey, leashAvailable as leashAvailableAccount } from "@kitty/ledger/accounts";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { DbLike } from "../../lib/db-types";
import { toCents } from "../../lib/money";

/** Drizzle queries for leashes and their ledger-derived usage (CODE_RULES.md §D). */

export interface LeashBalanceCents {
  readonly availableCents: bigint;
  readonly heldCents: bigint;
}

export interface ListIntentsInput {
  readonly kittyId: string;
  readonly status: string | undefined;
  readonly leashId: string | undefined;
  readonly limit: number;
}

export async function insertLeash(db: DbLike, row: NewLeash): Promise<LeashRow> {
  const [inserted] = await db.insert(leashes).values(row).returning();

  if (inserted === undefined) {
    throw new Error("leash insert returned no row");
  }

  return inserted;
}

export async function findLeashById(db: DbLike, id: string): Promise<LeashRow | undefined> {
  const [row] = await db.select().from(leashes).where(eq(leashes.id, id)).limit(1);

  return row;
}

/** Locks the leash row for a status/allocation change. */
export async function findLeashByIdForUpdate(
  db: DbLike,
  id: string,
): Promise<LeashRow | undefined> {
  const [row] = await db.select().from(leashes).where(eq(leashes.id, id)).limit(1).for("update");

  return row;
}

export async function listLeashesByKitty(db: DbLike, kittyId: string): Promise<LeashRow[]> {
  return db
    .select()
    .from(leashes)
    .where(eq(leashes.kittyId, kittyId))
    .orderBy(desc(leashes.createdAt));
}

export async function findActiveLeashByAgent(
  db: DbLike,
  agentId: string,
): Promise<LeashRow | undefined> {
  const [row] = await db
    .select()
    .from(leashes)
    .where(and(eq(leashes.agentId, agentId), eq(leashes.status, "active")))
    .limit(1);

  return row;
}

export async function listChildLeashes(db: DbLike, parentId: string): Promise<LeashRow[]> {
  return db.select().from(leashes).where(eq(leashes.parentId, parentId));
}

export async function updateLeashStatus(
  db: DbLike,
  id: string,
  status: LeashStatus,
  statusReason: string | null,
): Promise<LeashRow> {
  const [updated] = await db
    .update(leashes)
    .set({ status, statusReason, version: sql`${leashes.version} + 1` })
    .where(eq(leashes.id, id))
    .returning();

  if (updated === undefined) {
    throw new Error("leash status update returned no row");
  }

  return updated;
}

export async function addLeashAllocation(
  db: DbLike,
  id: string,
  amountCents: bigint,
): Promise<LeashRow> {
  const [updated] = await db
    .update(leashes)
    .set({
      allocationCents: sql`${leashes.allocationCents} + ${amountCents}`,
      version: sql`${leashes.version} + 1`,
    })
    .where(eq(leashes.id, id))
    .returning();

  if (updated === undefined) {
    throw new Error("leash allocation update returned no row");
  }

  return updated;
}

/** Balance of `leash:{id}:available` from the ledger. */
export async function leashAvailableCents(db: DbLike, leashId: string): Promise<bigint> {
  const availableAccount = accountKey(leashAvailableAccount(leashId));

  const [row] = await db
    .select({
      available: sql<string>`coalesce(sum(case when ${ledgerEntries.account} = ${availableAccount} then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.account, availableAccount));

  if (row === undefined) {
    throw new Error("leash available query returned no row");
  }

  return toCents(row.available, "leash.available");
}

/** Per-leash `available`/`held` from the `leash_balances` view, keyed by leash id. */
export async function leashBalancesByKitty(
  db: DbLike,
  kittyId: string,
): Promise<Map<string, LeashBalanceCents>> {
  const rows = await db.select().from(leashBalances).where(eq(leashBalances.kittyId, kittyId));
  const balances = new Map<string, LeashBalanceCents>();

  for (const row of rows) {
    balances.set(row.leashId, {
      availableCents: toCents(row.availableCents, "leash.available"),
      heldCents: toCents(row.heldCents, "leash.held"),
    });
  }

  return balances;
}

/** `available`/`held` of one leash from the `leash_balances` view. */
export async function leashBalance(
  db: DbLike,
  kittyId: string,
  leashId: string,
): Promise<LeashBalanceCents> {
  const [row] = await db
    .select()
    .from(leashBalances)
    .where(and(eq(leashBalances.kittyId, kittyId), eq(leashBalances.leashId, leashId)))
    .limit(1);

  if (row === undefined) {
    return { availableCents: 0n, heldCents: 0n };
  }

  return {
    availableCents: toCents(row.availableCents, "leash.available"),
    heldCents: toCents(row.heldCents, "leash.held"),
  };
}

/** Settled spend of the leash in the trailing 24h window (docs/05 §10). */
export async function spent24hCents(db: DbLike, leashId: string): Promise<bigint> {
  const heldAccount = accountKey({ kind: "leash", leashId, bucket: "held" });

  const [row] = await db
    .select({
      spent: sql<string>`coalesce(-sum(case when ${ledgerEntries.kind} = 'settle' then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.account, heldAccount),
        sql`${ledgerEntries.createdAt} >= now() - interval '24 hours'`,
      ),
    );

  if (row === undefined) {
    throw new Error("leash spent24h query returned no row");
  }

  return toCents(row.spent, "leash.spent24h");
}

export async function listIntents(db: DbLike, input: ListIntentsInput): Promise<SpendIntentRow[]> {
  const filters = [eq(leashes.kittyId, input.kittyId)];

  if (input.status !== undefined) {
    filters.push(sql`${spendIntents.status}::text = ${input.status}`);
  }

  if (input.leashId !== undefined) {
    filters.push(eq(spendIntents.leashId, input.leashId));
  }

  return db
    .select({ ...getTableColumns(spendIntents) })
    .from(spendIntents)
    .innerJoin(leashes, eq(spendIntents.leashId, leashes.id))
    .where(and(...filters))
    .orderBy(desc(spendIntents.createdAt))
    .limit(input.limit);
}
