import { describe, expect, test } from "bun:test";
import type { LeashRow } from "@kitty/db/schema";
import { allocateLeash } from "@kitty/ledger";
import { AppError } from "../../../src/lib/errors";
import {
  createIntentsService,
  decisionToStatus,
  isDefinitivePayPalFailure,
} from "../../../src/modules/intents/intents.service";
import { payloadHash } from "../../../src/modules/intents/payload";
import { createFakeIntentsStore, type FakeIntentsStore } from "../../support/intents/fake-store";
import {
  createFakePayouts,
  type FakePayouts,
  paypalNetworkFailure,
  paypalRejection,
  spendIntent,
} from "../../support/intents/fixtures";

const KITTY_ID = "kty_test";
const AGENT_ID = "agt_agent";
const LEASH_ID = "lsh_test";
const NOW = new Date("2026-10-17T12:00:00.000Z");

interface Harness {
  readonly store: FakeIntentsStore;
  readonly payouts: FakePayouts;
  readonly service: ReturnType<typeof createIntentsService>;
}

function setup(leashOverrides: Partial<LeashRow> = {}): Harness {
  const leash = fakeTestLeash(leashOverrides);
  const store = createFakeIntentsStore({
    leashes: [leash],
    ledgerTxns: [
      {
        kittyId: KITTY_ID,
        txn: allocateLeash({
          txnId: "txn_alloc",
          kittyId: KITTY_ID,
          leashId: LEASH_ID,
          amountCents: leash.allocationCents,
        }),
      },
    ],
    now: () => NOW,
  });
  const payouts = createFakePayouts();

  return {
    store,
    payouts,
    service: createIntentsService({
      store,
      payouts: payouts.executor,
      now: () => NOW,
    }),
  };
}

function fakeTestLeash(overrides: Partial<LeashRow>): LeashRow {
  return {
    id: LEASH_ID,
    kittyId: KITTY_ID,
    parentId: null,
    agentId: AGENT_ID,
    currency: "USD",
    allocationCents: 10_000n,
    perTxMaxCents: 10_000n,
    dailyMaxCents: 10_000n,
    maxTxPerHour: 100,
    allowedActions: ["payout", "create_invoice"],
    allowedPayees: ["vendor@example.com"],
    allowedCategories: ["lodging"],
    stepUpAboveCents: null,
    notBefore: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    status: "active",
    statusReason: null,
    createdBy: "usr_owner",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    version: 1,
    ...overrides,
  };
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

describe("decisionToStatus", () => {
  test("maps each outcome to its intent status", () => {
    expect(decisionToStatus({ outcome: "ALLOW" })).toBe("reserved");
    expect(decisionToStatus({ outcome: "STEP_UP", reasons: [] })).toBe("awaiting_approval");
    expect(decisionToStatus({ outcome: "DENY", reasons: [] })).toBe("denied");
  });
});

describe("isDefinitivePayPalFailure", () => {
  test("a 4xx (except 401/408/429) is definitive", () => {
    expect(isDefinitivePayPalFailure(paypalRejection(422))).toBe(true);
    expect(isDefinitivePayPalFailure(paypalRejection(400))).toBe(true);
    expect(isDefinitivePayPalFailure(paypalRejection(401))).toBe(false);
    expect(isDefinitivePayPalFailure(paypalRejection(429))).toBe(false);
  });

  test("an unknown status or a 5xx is not definitive", () => {
    expect(isDefinitivePayPalFailure(paypalNetworkFailure())).toBe(false);
    expect(isDefinitivePayPalFailure(paypalRejection(500))).toBe(false);
  });
});

describe("reserveIntent", () => {
  test("ALLOW reserves on the ledger and executes the payout", async () => {
    const harness = setup();
    const request = spendIntent({ intentId: "int_allow" });

    const result = await harness.service.reserveIntent({ agentId: AGENT_ID, request });

    expect(result.decision).toEqual({ outcome: "ALLOW" });
    expect(result.status).toBe("submitted");
    expect(result.replayed).toBe(false);
    expect(result.execution?.outcome).toBe("submitted");

    expect(harness.payouts.calls).toHaveLength(1);
    expect(harness.payouts.calls[0]?.requestId).toBe("int_allow");
    expect(harness.payouts.calls[0]?.amountCents).toBe(1_000n);

    expect(harness.store.state.ledgerTxns.map((entry) => entry.txn.kind)).toEqual([
      "allocateLeash",
      "reserve",
    ]);
    expect(harness.store.state.paypalObjects).toHaveLength(1);
    expect(harness.store.state.paypalObjects[0]?.id).toBe("BATCH-1");
    expect(harness.store.state.paypalObjects[0]?.kind).toBe("payout_batch");
    expect(harness.store.state.outboxEvents.map((event) => event.type)).toEqual([
      "intent.decided",
      "intent.submitted",
    ]);
    expect(harness.store.state.intents[0]?.payloadHash).toBe(await payloadHash(request));
    expect(harness.store.state.intents[0]?.status).toBe("submitted");
  });

  test("DENY writes the intent but no ledger lines and no PayPal call", async () => {
    const harness = setup();

    const result = await harness.service.reserveIntent({
      agentId: AGENT_ID,
      request: spendIntent({ intentId: "int_deny", amountCents: 20_000n }),
    });

    expect(result.decision.outcome).toBe("DENY");
    expect(result.status).toBe("denied");
    expect(result.execution).toBeNull();
    expect(harness.payouts.calls).toHaveLength(0);
    expect(harness.store.state.ledgerTxns.map((entry) => entry.txn.kind)).toEqual([
      "allocateLeash",
    ]);
    expect(harness.store.state.outboxEvents.map((event) => event.type)).toEqual(["intent.decided"]);

    if (result.decision.outcome === "DENY") {
      const codes = result.decision.reasons.map((reason) => reason.code);

      expect(codes).toContain("AMOUNT_EXCEEDS_PER_TX");
      expect(codes).toContain("INSUFFICIENT_LEASH_BALANCE");
    }
  });

  test("STEP_UP holds the money and opens a 15-minute approval", async () => {
    const harness = setup({ stepUpAboveCents: 500n });

    const result = await harness.service.reserveIntent({
      agentId: AGENT_ID,
      request: spendIntent({ intentId: "int_step_up", amountCents: 1_000n }),
    });

    expect(result.decision.outcome).toBe("STEP_UP");
    expect(result.status).toBe("awaiting_approval");
    expect(result.execution).toBeNull();
    expect(harness.payouts.calls).toHaveLength(0);
    expect(harness.store.state.ledgerTxns.map((entry) => entry.txn.kind)).toEqual([
      "allocateLeash",
      "reserve",
    ]);
    expect(harness.store.state.approvals).toHaveLength(1);
    expect(harness.store.state.approvals[0]?.intentId).toBe("int_step_up");
    expect(harness.store.state.approvals[0]?.expiresAt.getTime()).toBe(NOW.getTime() + 15 * 60_000);
  });

  test("replaying the same intent returns the stored decision once", async () => {
    const harness = setup();
    const request = spendIntent({ intentId: "int_idempotent" });

    const first = await harness.service.reserveIntent({ agentId: AGENT_ID, request });
    const second = await harness.service.reserveIntent({ agentId: AGENT_ID, request });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.status).toBe(first.status);
    expect(second.decision).toEqual(first.decision);
    expect(harness.store.state.intents).toHaveLength(1);
    expect(
      harness.store.state.ledgerTxns.filter((entry) => entry.txn.kind === "reserve"),
    ).toHaveLength(1);
    expect(harness.payouts.calls).toHaveLength(1);
  });

  test("same intent id with a different amount is a conflict", async () => {
    const harness = setup();
    const request = spendIntent({ intentId: "int_conflict", amountCents: 1_000n });

    await harness.service.reserveIntent({ agentId: AGENT_ID, request });

    await expectAppError(
      () =>
        harness.service.reserveIntent({
          agentId: AGENT_ID,
          request: spendIntent({ intentId: "int_conflict", amountCents: 2_000n }),
        }),
      "INTENT_ID_REUSED",
    );
    expect(harness.store.state.intents).toHaveLength(1);
  });

  test("an agent without an active leash cannot reserve", async () => {
    const store = createFakeIntentsStore({ leashes: [], now: () => NOW });
    const payouts = createFakePayouts();
    const service = createIntentsService({ store, payouts: payouts.executor, now: () => NOW });

    await expectAppError(
      () => service.reserveIntent({ agentId: AGENT_ID, request: spendIntent() }),
      "LEASH_NOT_FOUND",
    );
  });

  test("a non-payout ALLOW stays reserved and records NOT_IMPLEMENTED", async () => {
    const harness = setup();

    const result = await harness.service.reserveIntent({
      agentId: AGENT_ID,
      request: spendIntent({ intentId: "int_invoice", action: "create_invoice" }),
    });

    expect(result.decision.outcome).toBe("ALLOW");
    expect(result.status).toBe("reserved");
    expect(result.execution?.outcome).toBe("not_implemented");
    expect(harness.payouts.calls).toHaveLength(0);
    expect(harness.store.state.intents[0]?.lastExecuteError).toMatchObject({
      code: "NOT_IMPLEMENTED",
    });
  });
});

describe("executeIntent", () => {
  test("a definitive PayPal rejection releases the hold", async () => {
    const harness = setup();
    harness.payouts.failWith(paypalRejection(422));

    const result = await harness.service.reserveIntent({
      agentId: AGENT_ID,
      request: spendIntent({ intentId: "int_rejected" }),
    });

    expect(result.status).toBe("released");
    expect(result.execution?.outcome).toBe("failed_released");
    expect(harness.store.state.ledgerTxns.map((entry) => entry.txn.kind)).toEqual([
      "allocateLeash",
      "reserve",
      "release",
    ]);
    expect(harness.store.state.outboxEvents.map((event) => event.type)).toEqual([
      "intent.decided",
      "intent.failed",
    ]);
    expect(harness.store.state.intents[0]?.status).toBe("released");
    expect(harness.store.state.intents[0]?.error).toMatchObject({ code: "PAYPAL_REJECTED" });
  });

  test("an unknown outcome stays reserved and is safe to retry", async () => {
    const harness = setup();
    harness.payouts.failWith(paypalNetworkFailure());

    const result = await harness.service.reserveIntent({
      agentId: AGENT_ID,
      request: spendIntent({ intentId: "int_unknown" }),
    });

    expect(result.status).toBe("reserved");
    expect(result.execution?.outcome).toBe("unknown");
    expect(result.execution?.attempts).toBe(1);
    expect(harness.store.state.ledgerTxns.map((entry) => entry.txn.kind)).toEqual([
      "allocateLeash",
      "reserve",
    ]);
    expect(harness.store.state.intents[0]?.lastExecuteError).toMatchObject({
      code: "PAYPAL_UNKNOWN_OUTCOME",
    });

    // Retry succeeds without a second reserve line.
    harness.payouts.succeedWith({ batchId: "BATCH-RETRY", status: "PENDING" });
    const retry = await harness.service.executeIntent("int_unknown");

    expect(retry.outcome).toBe("submitted");
    expect(retry.attempts).toBe(2);
    expect(harness.payouts.calls).toHaveLength(2);
    expect(
      harness.store.state.ledgerTxns.filter((entry) => entry.txn.kind === "reserve"),
    ).toHaveLength(1);
  });

  test("executing an already submitted intent is a no-op", async () => {
    const harness = setup();

    await harness.service.reserveIntent({
      agentId: AGENT_ID,
      request: spendIntent({ intentId: "int_done" }),
    });
    const again = await harness.service.executeIntent("int_done");

    expect(again.outcome).toBe("noop");
    expect(again.status).toBe("submitted");
    expect(harness.payouts.calls).toHaveLength(1);
  });

  test("an unknown intent is a 404", async () => {
    const harness = setup();

    await expectAppError(() => harness.service.executeIntent("int_missing"), "INTENT_NOT_FOUND");
  });
});
