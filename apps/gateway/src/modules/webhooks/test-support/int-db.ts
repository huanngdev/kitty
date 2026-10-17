import { type Db } from "@kitty/db";
import {
  agentKeys,
  contributions,
  kitties,
  leashes,
  ledgerEntries,
  type LedgerEntryRow,
} from "@kitty/db/schema";
import { type LedgerTxn, type TxnKind, allocateLeash, contribution } from "@kitty/ledger";
import { asc, eq } from "drizzle-orm";
import { createDrizzleIntentsStore } from "../../intents/intents.repository";

/**
 * Shared setup for the webhook integration tests.
 *
 * They run against the real Postgres dev branch (never CI): the seeding here
 * mirrors what the Admin API and KIT-16 leave behind — a funded kitty, an agent
 * key, an active leash and a double-entry ledger — so the webhook/reconcile
 * paths are exercised against actual `FOR UPDATE` locking and `ON CONFLICT`.
 */

/** `leash.ledger_entries.kind` (docs/09 §3.2) → the `@kitty/ledger` txn kind. */
const DB_KIND_TO_TXN: Readonly<Record<string, TxnKind>> = {
  contribution: "contribution",
  allocate: "allocateLeash",
  delegate: "delegate",
  reserve: "reserve",
  settle: "settlePayout",
  release: "release",
  revoke_return: "revokeLeash",
  refund: "refundMember",
};

function toTxnKind(value: string): TxnKind {
  const kind = DB_KIND_TO_TXN[value];

  if (kind === undefined) {
    throw new Error(`unknown ledger txn kind: ${value}`);
  }

  return kind;
}

/** A short unique suffix so parallel runs never collide on ids. */
export function runSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export interface SeedFundedLeashInput {
  readonly kittyId: string;
  readonly agentId: string;
  readonly leashId: string;
  readonly allocationCents: bigint;
  /** What the leash is allowed to pay; usually the sandbox payee. */
  readonly allowedPayees: readonly string[];
}

/** Creates a kitty + agent key + active leash and funds it through the ledger. */
export async function seedFundedLeash(db: Db, input: SeedFundedLeashInput): Promise<void> {
  const run = input.leashId;

  await db.transaction(async (tx) => {
    await tx.insert(kitties).values({
      id: input.kittyId,
      eventId: `evt_${run}`,
      ownerUserId: `usr_${run}`,
      currency: "USD",
    });
    await tx.insert(agentKeys).values({
      agentId: input.agentId,
      kittyId: input.kittyId,
      role: "shopper",
      publicKey: `pk_${run}`,
    });
    await tx.insert(leashes).values({
      id: input.leashId,
      kittyId: input.kittyId,
      agentId: input.agentId,
      currency: "USD",
      allocationCents: input.allocationCents,
      perTxMaxCents: input.allocationCents,
      dailyMaxCents: input.allocationCents,
      maxTxPerHour: 10,
      allowedActions: ["payout"],
      allowedPayees: [...input.allowedPayees],
      allowedCategories: ["lodging"],
      stepUpAboveCents: null,
      notBefore: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      status: "active",
      createdBy: `usr_${run}`,
    });
    await tx.insert(contributions).values({
      id: `ctr_${run}`,
      kittyId: input.kittyId,
      memberId: null,
      source: "seed",
      amountCents: input.allocationCents,
      receivedAt: new Date(),
    });
  });

  const store = createDrizzleIntentsStore(db);

  await store.transaction(async (tx) => {
    await tx.insertLedgerEntry({
      kittyId: input.kittyId,
      txn: contribution({
        txnId: `txn_ctr_${run}`,
        kittyId: input.kittyId,
        memberId: `mem_${run}`,
        amountCents: input.allocationCents,
      }),
    });
    await tx.insertLedgerEntry({
      kittyId: input.kittyId,
      txn: allocateLeash({
        txnId: `txn_alloc_${run}`,
        kittyId: input.kittyId,
        leashId: input.leashId,
        amountCents: input.allocationCents,
      }),
    });
  });
}

/** Reads a kitty's ledger back as `@kitty/ledger` transactions, in posting order. */
export async function loadTxns(db: Db, kittyId: string): Promise<LedgerTxn[]> {
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.kittyId, kittyId))
    .orderBy(asc(ledgerEntries.id));

  const grouped = new Map<string, LedgerEntryRow[]>();

  for (const row of rows) {
    const group = grouped.get(row.txnId);

    if (group === undefined) {
      grouped.set(row.txnId, [row]);
    } else {
      group.push(row);
    }
  }

  return [...grouped].flatMap(([txnId, group]) => {
    const first = group[0];

    if (first === undefined) {
      return [];
    }

    return [
      {
        txnId,
        kind: toTxnKind(first.kind),
        lines: group.map((row) => ({ account: row.account, amountCents: row.amountCents })),
        intentId: first.ref === txnId ? undefined : (first.ref ?? undefined),
      },
    ];
  });
}
