import { describe, expect, test } from "bun:test";
import type { SpendIntentRow } from "@kitty/db/schema";
import {
  type LedgerTxn,
  allocateLeash,
  checkInvariants,
  contribution,
  reserve,
} from "@kitty/ledger";
import {
  createReconcileService,
  type ReconcileService,
} from "../../../src/modules/webhooks/reconcile.service";
import { createFakeWebhooksStore, type FakeWebhooksStore } from "../../support/webhooks/fake-store";
import {
  TEST_INTENT_ID,
  createFakePayoutStatusReader,
  fakeIntentRow,
  payoutBatch,
  payoutItem,
} from "../../support/webhooks/fixtures";

/**
 * Unit tests of the reconcile sweep (docs/10 §6, docs/11 §4).
 *
 * The PayPal read is injected; the transitions must be the same ones the
 * webhook handler applies, so the assertions mirror `webhooks.service.test.ts`.
 */

const KITTY_ID = "kty_test_reconcile";
const LEASH_ID = "lsh_test_reconcile";
const FUND_CENTS = 10_000n;
const AMOUNT_CENTS = 100n;
const NOW = new Date("2026-10-17T12:00:00.000Z");

function seedTxns(intentId: string): LedgerTxn[] {
  return [
    contribution({
      txnId: `txn_ctr_${intentId}`,
      kittyId: KITTY_ID,
      memberId: "mem_test",
      amountCents: FUND_CENTS,
    }),
    allocateLeash({
      txnId: `txn_alloc_${intentId}`,
      kittyId: KITTY_ID,
      leashId: LEASH_ID,
      amountCents: FUND_CENTS,
    }),
    reserve({
      txnId: `txn_reserve_${intentId}`,
      leashId: LEASH_ID,
      amountCents: AMOUNT_CENTS,
      intentId,
    }),
  ];
}

function build(
  input: {
    intent?: Partial<SpendIntentRow>;
  } = {},
): {
  store: FakeWebhooksStore;
  service: ReconcileService;
  reader: ReturnType<typeof createFakePayoutStatusReader>;
} {
  const intent = fakeIntentRow({
    id: TEST_INTENT_ID,
    leashId: LEASH_ID,
    amountCents: AMOUNT_CENTS,
    // Submitted 10 minutes ago, so the default 5-minute window picks it up.
    updatedAt: new Date(NOW.getTime() - 10 * 60_000),
    ...input.intent,
  });

  const store = createFakeWebhooksStore({
    intents: [intent],
    kittyIdOfLeash: new Map([[LEASH_ID, KITTY_ID]]),
    ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
  });
  const reader = createFakePayoutStatusReader();
  const service = createReconcileService({
    store,
    payouts: reader.reader,
    now: () => NOW,
  });

  return { store, service, reader };
}

function invariants(store: FakeWebhooksStore): unknown[] {
  return checkInvariants(
    store.state.ledgerTxns.map((entry) => entry.txn),
    { kittyOfLeash: new Map([[LEASH_ID, KITTY_ID]]) },
  );
}

describe("reconcile sweep", () => {
  test("settles a submitted intent PayPal reports as SUCCESS", async () => {
    const { store, service, reader } = build();

    const result = await service.reconcile({ olderThanMinutes: 5, limit: 25 });

    expect(result).toEqual({ scanned: 1, settled: 1, failed: 0, unchanged: 0, errored: 0 });
    expect(store.state.intents[0]?.status).toBe("settled");
    expect(
      store.state.ledgerTxns.filter((entry) => entry.txn.kind === "settlePayout"),
    ).toHaveLength(1);
    expect(store.state.outboxEvents.map((event) => event.type)).toEqual(["leash.intent_settled"]);
    expect(store.state.paypalObjects[0]?.status).toBe("SUCCESS");
    expect(reader.calls()).toBe(1);
    expect(invariants(store)).toEqual([]);
  });

  test("runs again without changing anything", async () => {
    const { store, service } = build();

    await service.reconcile({ olderThanMinutes: 5, limit: 25 });
    const second = await service.reconcile({ olderThanMinutes: 5, limit: 25 });

    expect(second).toEqual({ scanned: 0, settled: 0, failed: 0, unchanged: 0, errored: 0 });
    expect(
      store.state.ledgerTxns.filter((entry) => entry.txn.kind === "settlePayout"),
    ).toHaveLength(1);
    expect(store.state.auditEvents).toHaveLength(1);
  });

  test("releases the hold when the item failed", async () => {
    const { store, service, reader } = build();
    reader.respondWith(
      payoutBatch({ status: "FAILED", items: [payoutItem({ status: "FAILED" })] }),
    );

    const result = await service.reconcile({ olderThanMinutes: 5, limit: 25 });

    expect(result).toEqual({ scanned: 1, settled: 0, failed: 1, unchanged: 0, errored: 0 });
    expect(store.state.intents[0]?.status).toBe("released");
    expect(store.state.ledgerTxns.filter((entry) => entry.txn.kind === "release")).toHaveLength(1);
    expect(store.state.outboxEvents.map((event) => event.type)).toEqual(["leash.intent_failed"]);
    expect(invariants(store)).toEqual([]);
  });

  test("releases the hold when PayPal denied the whole batch", async () => {
    const { store, service, reader } = build();
    reader.respondWith(payoutBatch({ status: "DENIED", items: [] }));

    const result = await service.reconcile({ olderThanMinutes: 5, limit: 25 });

    expect(result.failed).toBe(1);
    expect(store.state.intents[0]?.status).toBe("released");
  });

  test("leaves the intent submitted while PayPal is still processing", async () => {
    const { store, service, reader } = build();
    reader.respondWith(
      payoutBatch({ status: "PENDING", items: [payoutItem({ status: "PENDING" })] }),
    );

    const result = await service.reconcile({ olderThanMinutes: 5, limit: 25 });

    expect(result).toEqual({ scanned: 1, settled: 0, failed: 0, unchanged: 1, errored: 0 });
    expect(store.state.intents[0]?.status).toBe("submitted");
    expect(store.state.ledgerTxns).toHaveLength(3);
  });

  test("does not touch a recent intent inside the window", async () => {
    const { store, service, reader } = build({
      intent: { updatedAt: new Date(NOW.getTime() - 60_000) },
    });

    const result = await service.reconcile({ olderThanMinutes: 5, limit: 25 });

    expect(result.scanned).toBe(0);
    expect(reader.calls()).toBe(0);
    expect(store.state.intents[0]?.status).toBe("submitted");
  });

  test("supports a zero-minute window for tests and demos", async () => {
    const { service } = build({ intent: { updatedAt: NOW } });

    const result = await service.reconcile({ olderThanMinutes: 0, limit: 25 });

    expect(result.scanned).toBe(1);
    expect(result.settled).toBe(1);
  });

  test("counts a PayPal read failure as errored and changes nothing", async () => {
    const { store, service, reader } = build();
    reader.failWith(new Error("network down"));

    const result = await service.reconcile({ olderThanMinutes: 5, limit: 25 });

    expect(result).toEqual({ scanned: 1, settled: 0, failed: 0, unchanged: 0, errored: 1 });
    expect(store.state.intents[0]?.status).toBe("submitted");
    expect(store.state.ledgerTxns).toHaveLength(3);
  });

  test("counts a submitted intent without a batch id as errored", async () => {
    const { service } = build({ intent: { paypalRef: null } });

    const result = await service.reconcile({ olderThanMinutes: 5, limit: 25 });

    expect(result.errored).toBe(1);
  });

  test("honours the limit", async () => {
    const { service } = build();

    const result = await service.reconcile({ olderThanMinutes: 5, limit: 1 });

    expect(result.scanned).toBe(1);
  });
});
