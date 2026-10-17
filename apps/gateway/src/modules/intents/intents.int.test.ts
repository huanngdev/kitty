import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Db, createDb } from "@kitty/db";
import {
  agentKeys,
  approvals,
  contributions,
  kitties,
  leashes,
  ledgerEntries,
  paypalObjects,
  spendIntents,
  type LedgerEntryRow,
} from "@kitty/db/schema";
import {
  type LedgerTxn,
  type TxnKind,
  allocateLeash,
  checkInvariants,
  contribution,
} from "@kitty/ledger";
import { asc, eq } from "drizzle-orm";
import { AppError } from "../../lib/errors";
import { getPayoutExecutor, type PayoutExecutor } from "../../lib/paypal";
import { createDrizzleIntentsStore } from "./intents.repository";
import { createIntentsService, type IntentsService } from "./intents.service";
import { spendIntent } from "./test-support/fixtures";

/**
 * Integration tests for reserve + execute (KIT-16).
 *
 * Not part of CI: they need `DATABASE_URL` and write to the shared dev branch
 * with unique throwaway ids (ledger and audit are append-only). Run with:
 *
 *   bun run --filter gateway test:integration
 */

const databaseUrl = process.env.DATABASE_URL;
const payeeEmail = process.env.PAYPAL_SANDBOX_PAYEE_EMAIL;
const hasPayPal = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const TXN_KINDS: readonly TxnKind[] = [
  "contribution",
  "allocateLeash",
  "delegate",
  "reserve",
  "settlePayout",
  "release",
  "revokeLeash",
  "refundMember",
];

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

  if (kind === undefined || !TXN_KINDS.includes(kind)) {
    throw new Error(`unknown ledger txn kind: ${value}`);
  }

  return kind;
}

function runSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Neon adds latency; 10 serialized transactions comfortably exceed the 5s default. */
const INTEGRATION_TIMEOUT_MS = 60_000;

interface SeedLeash {
  readonly kittyId: string;
  readonly agentId: string;
  readonly leashId: string;
  readonly allocationCents: bigint;
  readonly perTxMaxCents: bigint;
  readonly dailyMaxCents: bigint;
  readonly maxTxPerHour: number;
  readonly allowedActions: readonly string[];
  readonly allowedPayees: readonly string[];
  readonly stepUpAboveCents: bigint | null;
}

/** Creates a kitty + agent + leash and funds it through the real ledger builders. */
async function seedLeash(db: Db, input: SeedLeash): Promise<void> {
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
      perTxMaxCents: input.perTxMaxCents,
      dailyMaxCents: input.dailyMaxCents,
      maxTxPerHour: input.maxTxPerHour,
      allowedActions: [...input.allowedActions],
      allowedPayees: [...input.allowedPayees],
      allowedCategories: ["lodging"],
      stepUpAboveCents: input.stepUpAboveCents,
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

async function loadTxns(db: Db, kittyId: string): Promise<LedgerTxn[]> {
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

  const txns: LedgerTxn[] = [];

  for (const [txnId, group] of grouped) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }

    txns.push({
      txnId,
      kind: toTxnKind(first.kind),
      lines: group.map((row) => ({ account: row.account, amountCents: row.amountCents })),
      intentId: first.ref === txnId ? undefined : (first.ref ?? undefined),
    });
  }

  return txns;
}

const noPayPal: PayoutExecutor = {
  createPayout: () => {
    throw new Error("PayPal must not be called for these intents");
  },
};

function serviceFor(db: Db, payouts: PayoutExecutor, now: () => Date): IntentsService {
  return createIntentsService({
    store: createDrizzleIntentsStore(db),
    payouts,
    now,
  });
}

async function expectAppError(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof AppError) {
      expect(error.code).toBe(code);
      return;
    }
    throw error;
  }

  throw new Error(`expected an AppError with code ${code}`);
}

describe.skipIf(databaseUrl === undefined)("intents reserve/execute (integration)", () => {
  let db: Db;

  beforeAll(async () => {
    if (databaseUrl === undefined) {
      throw new Error("DATABASE_URL is required for the integration tests");
    }

    db = createDb(databaseUrl);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  test(
    "10 concurrent $100 reservations on a $300 leash: exactly 3 win",
    async () => {
      const run = runSuffix();
      const kittyId = `kty_it_a_${run}`;
      const agentId = `agt_it_a_${run}`;
      const leashId = `lsh_it_a_${run}`;
      const payees = Array.from({ length: 10 }, (_, index) => `vendor${index}-${run}@example.com`);

      await seedLeash(db, {
        kittyId,
        agentId,
        leashId,
        allocationCents: 30_000n,
        perTxMaxCents: 10_000n,
        dailyMaxCents: 100_000_000n,
        maxTxPerHour: 100,
        allowedActions: ["create_invoice"],
        allowedPayees: payees,
        stepUpAboveCents: null,
      });

      const service = serviceFor(db, noPayPal, () => new Date());

      const results = await Promise.all(
        payees.map((payee, index) =>
          service.reserveIntent({
            agentId,
            request: spendIntent({
              intentId: `int_it_a_${run}_${index}`,
              action: "create_invoice",
              amountCents: 10_000n,
              payee,
            }),
          }),
        ),
      );

      const allowed = results.filter((result) => result.decision.outcome === "ALLOW");
      const denied = results.filter((result) => result.decision.outcome === "DENY");

      expect(allowed).toHaveLength(3);
      expect(denied).toHaveLength(7);

      for (const result of denied) {
        if (result.decision.outcome === "DENY") {
          expect(result.decision.reasons.map((reason) => reason.code)).toContain(
            "INSUFFICIENT_LEASH_BALANCE",
          );
        }
      }

      const rows = await db.select().from(spendIntents).where(eq(spendIntents.leashId, leashId));

      expect(rows.filter((row) => row.status === "reserved")).toHaveLength(3);
      expect(rows.filter((row) => row.status === "denied")).toHaveLength(7);

      const txns = await loadTxns(db, kittyId);

      expect(checkInvariants(txns, { kittyOfLeash: new Map([[leashId, kittyId]]) })).toEqual([]);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  test(
    "the same intent id submitted twice concurrently is stored once",
    async () => {
      const run = runSuffix();
      const kittyId = `kty_it_b_${run}`;
      const agentId = `agt_it_b_${run}`;
      const leashId = `lsh_it_b_${run}`;
      const payee = `vendor-${run}@example.com`;

      await seedLeash(db, {
        kittyId,
        agentId,
        leashId,
        allocationCents: 100_000n,
        perTxMaxCents: 10_000n,
        dailyMaxCents: 100_000_000n,
        maxTxPerHour: 100,
        allowedActions: ["create_invoice"],
        allowedPayees: [payee],
        stepUpAboveCents: null,
      });

      const service = serviceFor(db, noPayPal, () => new Date());
      const request = spendIntent({
        intentId: `int_it_b_${run}`,
        action: "create_invoice",
        amountCents: 1_000n,
        payee,
      });

      const [first, second] = await Promise.all([
        service.reserveIntent({ agentId, request }),
        service.reserveIntent({ agentId, request }),
      ]);

      expect(first.decision).toEqual(second.decision);
      expect(first.status).toBe(second.status);
      expect(first.status).toBe("reserved");

      const rows = await db.select().from(spendIntents).where(eq(spendIntents.leashId, leashId));
      expect(rows).toHaveLength(1);

      const txns = await loadTxns(db, kittyId);
      expect(txns.filter((txn) => txn.kind === "reserve")).toHaveLength(1);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  test(
    "the same intent id with a different amount is a conflict",
    async () => {
      const run = runSuffix();
      const kittyId = `kty_it_c_${run}`;
      const agentId = `agt_it_c_${run}`;
      const leashId = `lsh_it_c_${run}`;
      const payee = `vendor-${run}@example.com`;

      await seedLeash(db, {
        kittyId,
        agentId,
        leashId,
        allocationCents: 100_000n,
        perTxMaxCents: 10_000n,
        dailyMaxCents: 100_000_000n,
        maxTxPerHour: 100,
        allowedActions: ["create_invoice"],
        allowedPayees: [payee],
        stepUpAboveCents: null,
      });

      const service = serviceFor(db, noPayPal, () => new Date());
      const intentId = `int_it_c_${run}`;

      await service.reserveIntent({
        agentId,
        request: spendIntent({ intentId, action: "create_invoice", amountCents: 1_000n, payee }),
      });

      await expectAppError(
        () =>
          service.reserveIntent({
            agentId,
            request: spendIntent({
              intentId,
              action: "create_invoice",
              amountCents: 2_000n,
              payee,
            }),
          }),
        "INTENT_ID_REUSED",
      );

      const rows = await db.select().from(spendIntents).where(eq(spendIntents.id, intentId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amountCents).toBe(1_000n);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  test(
    "STEP_UP holds the money and creates an approval",
    async () => {
      const run = runSuffix();
      const kittyId = `kty_it_d_${run}`;
      const agentId = `agt_it_d_${run}`;
      const leashId = `lsh_it_d_${run}`;
      const payee = `vendor-${run}@example.com`;
      const intentId = `int_it_d_${run}`;

      await seedLeash(db, {
        kittyId,
        agentId,
        leashId,
        allocationCents: 100_000n,
        perTxMaxCents: 10_000n,
        dailyMaxCents: 100_000_000n,
        maxTxPerHour: 100,
        allowedActions: ["payout"],
        allowedPayees: [payee],
        stepUpAboveCents: 500n,
      });

      const service = serviceFor(db, noPayPal, () => new Date());
      const before = Date.now();

      const result = await service.reserveIntent({
        agentId,
        request: spendIntent({ intentId, action: "payout", amountCents: 1_000n, payee }),
      });

      expect(result.decision.outcome).toBe("STEP_UP");
      expect(result.status).toBe("awaiting_approval");

      const approvalRows = await db
        .select()
        .from(approvals)
        .where(eq(approvals.intentId, intentId));
      expect(approvalRows).toHaveLength(1);
      expect(approvalRows[0]?.status).toBe("pending");
      expect(approvalRows[0]?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 14 * 60_000);

      const txns = await loadTxns(db, kittyId);
      const reserveTxns = txns.filter((txn) => txn.kind === "reserve");
      expect(reserveTxns).toHaveLength(1);
      expect(reserveTxns[0]?.intentId).toBe(intentId);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  test.skipIf(!hasPayPal || payeeEmail === undefined)(
    "LIVE sandbox payout: submits once and re-executing is a no-op",
    async () => {
      if (payeeEmail === undefined) {
        throw new Error("PAYPAL_SANDBOX_PAYEE_EMAIL is required for the live payout test");
      }

      const run = runSuffix();
      const kittyId = `kty_it_e_${run}`;
      const agentId = `agt_it_e_${run}`;
      const leashId = `lsh_it_e_${run}`;
      const payee = payeeEmail.trim().toLowerCase();
      const intentId = `int_it_e_${run}`;

      await seedLeash(db, {
        kittyId,
        agentId,
        leashId,
        allocationCents: 10_000n,
        perTxMaxCents: 10_000n,
        dailyMaxCents: 100_000_000n,
        maxTxPerHour: 100,
        allowedActions: ["payout"],
        allowedPayees: [payee],
        stepUpAboveCents: null,
      });

      const service = serviceFor(db, getPayoutExecutor(), () => new Date());

      const result = await service.reserveIntent({
        agentId,
        request: spendIntent({
          intentId,
          action: "payout",
          amountCents: 100n,
          payee,
          memo: "KIT-16 live test",
        }),
      });

      expect(result.decision.outcome).toBe("ALLOW");
      expect(result.status).toBe("submitted");
      expect(result.execution?.outcome).toBe("submitted");
      expect(result.execution?.paypalRef).toBeTruthy();

      const execution = result.execution;
      expect(execution).not.toBeNull();
      const batchId = execution?.paypalRef ?? null;
      expect(typeof batchId).toBe("string");
      const objects = await db
        .select()
        .from(paypalObjects)
        .where(eq(paypalObjects.intentId, intentId));

      expect(objects).toHaveLength(1);
      expect(objects[0]?.kind).toBe("payout_batch");
      expect(objects[0]?.id).toBe(batchId ?? "");

      const again = await service.executeIntent(intentId);

      expect(again.outcome).toBe("noop");
      expect(again.paypalRef).toBe(batchId);

      const objectsAfter = await db
        .select()
        .from(paypalObjects)
        .where(eq(paypalObjects.intentId, intentId));
      expect(objectsAfter).toHaveLength(1);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
