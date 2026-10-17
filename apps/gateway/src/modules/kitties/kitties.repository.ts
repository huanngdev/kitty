import {
  type ContributionRow,
  type KittyRow,
  type LedgerEntryRow,
  type NewKitty,
  contributions,
  kitties,
  ledgerEntries,
} from "@kitty/db";
import { kittyAvailable as kittyAvailableAccount } from "@kitty/ledger";
import { accountKey } from "@kitty/ledger/accounts";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { DbLike } from "../../lib/db-types";
import { toCents } from "../../lib/money";

/**
 * Drizzle queries for kitties (CODE_RULES.md §D): no business rules, only SQL.
 */

export interface KittyBalancesCents {
  readonly availableCents: bigint;
  readonly allocatedCents: bigint;
  readonly heldCents: bigint;
  readonly spentCents: bigint;
  readonly contributedCents: bigint;
  readonly refundedCents: bigint;
}

export interface ListLedgerInput {
  readonly kittyId: string;
  readonly cursorId: number | undefined;
  readonly limit: number;
}

export interface LedgerPage {
  readonly items: LedgerEntryRow[];
  readonly nextCursor: string | null;
}

export interface ListContributionsInput {
  readonly kittyId: string;
  readonly limit: number;
}

export async function insertKitty(db: DbLike, row: NewKitty): Promise<KittyRow> {
  const [inserted] = await db.insert(kitties).values(row).returning();

  if (inserted === undefined) {
    throw new Error("kitty insert returned no row");
  }

  return inserted;
}

export async function findKittyById(db: DbLike, id: string): Promise<KittyRow | undefined> {
  const [row] = await db.select().from(kitties).where(eq(kitties.id, id)).limit(1);

  return row;
}

export async function findKittyByEventId(
  db: DbLike,
  eventId: string,
): Promise<KittyRow | undefined> {
  const [row] = await db.select().from(kitties).where(eq(kitties.eventId, eventId)).limit(1);

  return row;
}

/** Locks the kitty row so concurrent allocations serialize (docs/05 §7). */
export async function findKittyByIdForUpdate(
  db: DbLike,
  id: string,
): Promise<KittyRow | undefined> {
  const [row] = await db.select().from(kitties).where(eq(kitties.id, id)).limit(1).for("update");

  return row;
}

/** Kitty balances, computed from the ledger on every call (AGENTS.md invariant #5). */
export async function kittyBalances(db: DbLike, kittyId: string): Promise<KittyBalancesCents> {
  const availableAccount = accountKey(kittyAvailableAccount(kittyId));

  const [row] = await db
    .select({
      available: sql<string>`coalesce(sum(case when ${ledgerEntries.account} = ${availableAccount} then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
      allocated: sql<string>`coalesce(sum(case when ${ledgerEntries.account} like 'leash:%' then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
      held: sql<string>`coalesce(sum(case when ${ledgerEntries.account} like 'leash:%:held' then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
      spent: sql<string>`coalesce(sum(case when ${ledgerEntries.kind} = 'settle' and ${ledgerEntries.amountCents} > 0 then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
      contributed: sql<string>`coalesce(sum(case when ${ledgerEntries.kind} = 'contribution' and ${ledgerEntries.amountCents} > 0 then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
      refunded: sql<string>`coalesce(sum(case when ${ledgerEntries.kind} = 'refund' and ${ledgerEntries.amountCents} > 0 then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.kittyId, kittyId));

  if (row === undefined) {
    throw new Error("kitty balances query returned no row");
  }

  return {
    availableCents: toCents(row.available, "kitty.available"),
    allocatedCents: toCents(row.allocated, "kitty.allocated"),
    heldCents: toCents(row.held, "kitty.held"),
    spentCents: toCents(row.spent, "kitty.spent"),
    contributedCents: toCents(row.contributed, "kitty.contributed"),
    refundedCents: toCents(row.refunded, "kitty.refunded"),
  };
}

/** Balance of `kitty:{id}:available` alone; the ceiling a new leash draws from. */
export async function kittyAvailableCents(db: DbLike, kittyId: string): Promise<bigint> {
  const availableAccount = accountKey(kittyAvailableAccount(kittyId));

  const [row] = await db
    .select({
      available: sql<string>`coalesce(sum(case when ${ledgerEntries.account} = ${availableAccount} then ${ledgerEntries.amountCents} else 0 end), 0)::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.kittyId, kittyId));

  if (row === undefined) {
    throw new Error("kitty available query returned no row");
  }

  return toCents(row.available, "kitty.available");
}

export async function listLedgerEntries(db: DbLike, input: ListLedgerInput): Promise<LedgerPage> {
  const where =
    input.cursorId === undefined
      ? eq(ledgerEntries.kittyId, input.kittyId)
      : and(eq(ledgerEntries.kittyId, input.kittyId), lt(ledgerEntries.id, input.cursorId));

  const items = await db
    .select()
    .from(ledgerEntries)
    .where(where)
    .orderBy(desc(ledgerEntries.id))
    .limit(input.limit);

  const last = items.at(-1);
  const nextCursor = items.length === input.limit && last !== undefined ? String(last.id) : null;

  return { items, nextCursor };
}

export async function listContributions(
  db: DbLike,
  input: ListContributionsInput,
): Promise<ContributionRow[]> {
  return db
    .select()
    .from(contributions)
    .where(eq(contributions.kittyId, input.kittyId))
    .orderBy(desc(contributions.receivedAt))
    .limit(input.limit);
}
