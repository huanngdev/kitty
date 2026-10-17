import type { ContributionRow, Db, KittyRow, LedgerEntryRow } from "@kitty/db";
import { errorCodes, idPrefixes } from "@kitty/shared";
import {
  type Contribution,
  type CreateKittyInput,
  type KittyBalances,
  type KittyDetail,
  type KittyStatus,
  type LedgerEntry,
  type LedgerQuery,
  contributionSourceSchema,
  kittyStatusSchema,
} from "@kitty/shared/leash-admin";
import { AppError } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { centsToWire } from "../../lib/money";
import { narrowEnum } from "../../lib/narrow";
import { requireOwnedKitty } from "../../lib/ownership";
import { parseCursor } from "../../lib/pagination";
import type { KittyBalancesCents } from "./kitties.repository";
import * as repo from "./kitties.repository";

/**
 * Kitty service (docs/10-api-spec.md §1). Balances are always recomputed from
 * the ledger; nothing about a balance is stored (AGENTS.md invariant #5).
 */

/** Default page size for the non-cursor list endpoints. */
const DEFAULT_LIST_LIMIT = 100;

function toKittyStatus(value: string): KittyStatus {
  return narrowEnum(value, kittyStatusSchema.options, "kitty.status");
}

function toBalancesWire(balances: KittyBalancesCents): KittyBalances {
  return {
    available: centsToWire(balances.availableCents),
    allocated: centsToWire(balances.allocatedCents),
    held: centsToWire(balances.heldCents),
    spent: centsToWire(balances.spentCents),
    contributed: centsToWire(balances.contributedCents),
    refunded: centsToWire(balances.refundedCents),
  };
}

export function toKittyDetail(row: KittyRow, balances: KittyBalancesCents): KittyDetail {
  return {
    id: row.id,
    eventId: row.eventId,
    ownerUserId: row.ownerUserId,
    currency: row.currency,
    status: toKittyStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    balances: toBalancesWire(balances),
  };
}

export function toLedgerEntry(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    kittyId: row.kittyId,
    txnId: row.txnId,
    account: row.account,
    amount: centsToWire(row.amountCents),
    kind: narrowEnum(
      row.kind,
      [
        "contribution",
        "allocate",
        "delegate",
        "reserve",
        "settle",
        "release",
        "revoke_return",
        "refund",
        "topup",
      ] as const,
      "ledger.kind",
    ),
    ref: row.ref,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toContribution(row: ContributionRow): Contribution {
  return {
    id: row.id,
    kittyId: row.kittyId,
    memberId: row.memberId,
    source: narrowEnum(row.source, contributionSourceSchema.options, "contribution.source"),
    amount: centsToWire(row.amountCents),
    refunded: centsToWire(row.refundedCents),
    receivedAt: row.receivedAt.toISOString(),
  };
}

export interface LedgerFeed {
  readonly items: LedgerEntry[];
  readonly nextCursor: string | null;
}

export interface ContributionList {
  readonly items: Contribution[];
}

export async function createKitty(
  db: Db,
  input: CreateKittyInput,
  actorUserId: string,
): Promise<KittyDetail> {
  const existing = await repo.findKittyByEventId(db, input.eventId);

  if (existing !== undefined) {
    throw new AppError(errorCodes.conflict, 409, { eventId: input.eventId });
  }

  const row = await repo.insertKitty(db, {
    id: newId(idPrefixes.kitty),
    eventId: input.eventId,
    ownerUserId: actorUserId,
    currency: input.currency,
    status: "open",
  });

  const balances = await repo.kittyBalances(db, row.id);

  return toKittyDetail(row, balances);
}

export async function getKitty(db: Db, kittyId: string, actorUserId: string): Promise<KittyDetail> {
  const kitty = requireOwnedKitty(await repo.findKittyById(db, kittyId), actorUserId);
  const balances = await repo.kittyBalances(db, kitty.id);

  return toKittyDetail(kitty, balances);
}

export async function listKittyLedger(
  db: Db,
  kittyId: string,
  actorUserId: string,
  query: LedgerQuery,
): Promise<LedgerFeed> {
  requireOwnedKitty(await repo.findKittyById(db, kittyId), actorUserId);

  const page = await repo.listLedgerEntries(db, {
    kittyId,
    cursorId: parseCursor(query.cursor),
    limit: query.limit,
  });

  return { items: page.items.map(toLedgerEntry), nextCursor: page.nextCursor };
}

export async function listKittyContributions(
  db: Db,
  kittyId: string,
  actorUserId: string,
): Promise<ContributionList> {
  requireOwnedKitty(await repo.findKittyById(db, kittyId), actorUserId);

  const rows = await repo.listContributions(db, { kittyId, limit: DEFAULT_LIST_LIMIT });

  return { items: rows.map(toContribution) };
}
