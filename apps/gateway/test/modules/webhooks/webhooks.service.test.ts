import { describe, expect, test } from "bun:test";
import type { SpendIntentRow } from "@kitty/db/schema";
import {
  type LedgerTxn,
  allocateLeash,
  checkInvariants,
  contribution,
  reserve,
} from "@kitty/ledger";
import { parsePaypalWebhookEvent } from "@kitty/paypal";
import { createFakeWebhooksStore, type FakeWebhooksStore } from "../../support/webhooks/fake-store";
import {
  TEST_BATCH_ID,
  TEST_INTENT_ID,
  TEST_ITEM_ID,
  fakeIntentRow,
  payoutBatchEventPayload,
  payoutItemEventPayload,
  unknownEventPayload,
} from "../../support/webhooks/fixtures";
import {
  createWebhooksService,
  type WebhooksService,
} from "../../../src/modules/webhooks/webhooks.service";

/**
 * Unit tests of the webhook handler (docs/10 §5, docs/11 §3).
 *
 * The ledger invariants are asserted with the real `checkInvariants` from
 * `@kitty/ledger`, on the transactions the handlers actually wrote.
 */

const KITTY_ID = "kty_test_webhook";
const LEASH_ID = "lsh_test_webhook";
const FUND_CENTS = 10_000n;
const AMOUNT_CENTS = 100n;

/** Funds the leash and holds the intent's amount, as KIT-16 would have. */
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

function build(input: {
  intents?: readonly SpendIntentRow[];
  ledgerTxns?: readonly { kittyId: string; txn: LedgerTxn }[];
}): { store: FakeWebhooksStore; service: WebhooksService } {
  const store = createFakeWebhooksStore({
    intents: input.intents ?? [],
    kittyIdOfLeash: new Map([[LEASH_ID, KITTY_ID]]),
    ledgerTxns: input.ledgerTxns ?? [],
  });

  return { store, service: createWebhooksService({ store }) };
}

function submittedIntent(overrides: Partial<SpendIntentRow> = {}): SpendIntentRow {
  return fakeIntentRow({ id: TEST_INTENT_ID, amountCents: AMOUNT_CENTS, ...overrides });
}

function invariants(store: FakeWebhooksStore): unknown[] {
  return checkInvariants(
    store.state.ledgerTxns.map((entry) => entry.txn),
    { kittyOfLeash: new Map([[LEASH_ID, KITTY_ID]]) },
  );
}

function storedEvent(store: FakeWebhooksStore, eventId: string): { status: string } | undefined {
  return store.state.webhookEvents.find((event) => event.id === eventId);
}

describe("webhook handler: payout item SUCCEEDED", () => {
  test("settles the intent, moves the hold to the payee, and publishes the event", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED")),
    );

    expect(result).toEqual({ duplicate: false, status: "processed" });

    const updated = store.state.intents[0];
    expect(updated?.status).toBe("settled");
    expect(updated?.error).toBeNull();

    const settle = store.state.ledgerTxns.filter((entry) => entry.txn.kind === "settlePayout");
    expect(settle).toHaveLength(1);
    expect(settle[0]?.txn.lines).toEqual([
      { account: `leash:${LEASH_ID}:held`, amountCents: -AMOUNT_CENTS },
      { account: "external:payee:vendor@example.com", amountCents: AMOUNT_CENTS },
    ]);

    expect(store.state.auditEvents.map((event) => event.type)).toEqual(["intent.settled"]);
    expect(store.state.outboxEvents.map((event) => event.type)).toEqual(["leash.intent_settled"]);
    expect(store.state.paypalObjects).toEqual([
      {
        id: TEST_ITEM_ID,
        kind: "payout_item",
        intentId: intent.id,
        kittyId: KITTY_ID,
        status: "SUCCESS",
        raw: {
          payoutItemId: TEST_ITEM_ID,
          transactionStatus: "SUCCESS",
          payoutBatchId: TEST_BATCH_ID,
          senderItemId: TEST_INTENT_ID,
          transactionId: "1X1234567890",
          amount: "1.00",
          currency: "USD",
        },
      },
    ]);

    expect(invariants(store)).toEqual([]);
  });
});

describe("webhook handler: dedupe", () => {
  test("a second delivery of the same event id is a no-op", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });
    const event = parsePaypalWebhookEvent(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"));

    const first = await service.handleEvent(event);
    const second = await service.handleEvent(event);

    expect(first).toEqual({ duplicate: false, status: "processed" });
    expect(second).toEqual({ duplicate: true, status: "ignored" });

    // Exactly one money movement, one audit row, one outbox event.
    expect(
      store.state.ledgerTxns.filter((entry) => entry.txn.kind === "settlePayout"),
    ).toHaveLength(1);
    expect(store.state.auditEvents).toHaveLength(1);
    expect(store.state.outboxEvents).toHaveLength(1);
    expect(store.state.webhookEvents).toHaveLength(1);
    expect(invariants(store)).toEqual([]);
  });

  test("two deliveries of the same event id at once still settle once", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });
    const event = parsePaypalWebhookEvent(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"));

    const results = await Promise.all([service.handleEvent(event), service.handleEvent(event)]);

    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    expect(
      store.state.ledgerTxns.filter((entry) => entry.txn.kind === "settlePayout"),
    ).toHaveLength(1);
  });
});

describe("webhook handler: out-of-order deliveries", () => {
  test("a FAILED item arriving after SUCCEEDED is ignored", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });

    await service.handleEvent(
      parsePaypalWebhookEvent(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED")),
    );
    const late = await service.handleEvent(
      parsePaypalWebhookEvent(
        payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.FAILED", {
          eventId: "WH-LATE-1",
          transactionStatus: "FAILED",
        }),
      ),
    );

    expect(late).toEqual({ duplicate: false, status: "ignored" });
    expect(store.state.intents[0]?.status).toBe("settled");
    expect(store.state.ledgerTxns.filter((entry) => entry.txn.kind === "release")).toHaveLength(0);
    expect(storedEvent(store, "WH-LATE-1")?.status).toBe("ignored");
    expect(invariants(store)).toEqual([]);
  });

  test("a SUCCEEDED item before the intent is submitted does not settle", async () => {
    const intent = submittedIntent({ status: "reserved" });
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED")),
    );

    expect(result.status).toBe("ignored");
    expect(store.state.intents[0]?.status).toBe("reserved");
    expect(
      store.state.ledgerTxns.filter((entry) => entry.txn.kind === "settlePayout"),
    ).toHaveLength(0);
  });
});

describe("webhook handler: payout item failures", () => {
  for (const status of ["FAILED", "BLOCKED", "DENIED", "RETURNED"] as const) {
    test(`a ${status} item releases the hold`, async () => {
      const intent = submittedIntent();
      const { store, service } = build({
        intents: [intent],
        ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
      });

      const result = await service.handleEvent(
        parsePaypalWebhookEvent(
          payoutItemEventPayload(`PAYMENT.PAYOUTS-ITEM.${status}`, { transactionStatus: status }),
        ),
      );

      expect(result).toEqual({ duplicate: false, status: "processed" });
      expect(store.state.intents[0]?.status).toBe("released");

      const release = store.state.ledgerTxns.filter((entry) => entry.txn.kind === "release");
      expect(release).toHaveLength(1);
      expect(release[0]?.txn.lines).toEqual([
        { account: `leash:${LEASH_ID}:held`, amountCents: -AMOUNT_CENTS },
        { account: `leash:${LEASH_ID}:available`, amountCents: AMOUNT_CENTS },
      ]);

      expect(store.state.outboxEvents.map((event) => event.type)).toEqual(["leash.intent_failed"]);
      expect(invariants(store)).toEqual([]);

      // The retry of a failure is a no-op (status is terminal).
      const retry = await service.handleEvent(
        parsePaypalWebhookEvent(
          payoutItemEventPayload(`PAYMENT.PAYOUTS-ITEM.${status}`, {
            eventId: "WH-RETRY-1",
            transactionStatus: status,
          }),
        ),
      );
      expect(retry.status).toBe("ignored");
      expect(store.state.ledgerTxns.filter((entry) => entry.txn.kind === "release")).toHaveLength(
        1,
      );
    });
  }

  test("a RETURNED item after settlement records an alert without touching the ledger", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });

    await service.handleEvent(
      parsePaypalWebhookEvent(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED")),
    );
    const returned = await service.handleEvent(
      parsePaypalWebhookEvent(
        payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.RETURNED", {
          eventId: "WH-RETURN-1",
          transactionStatus: "RETURNED",
        }),
      ),
    );

    expect(returned).toEqual({ duplicate: false, status: "processed" });
    expect(store.state.intents[0]?.status).toBe("settled");
    expect(store.state.auditEvents.map((event) => event.type)).toEqual([
      "intent.settled",
      "intent.returned_after_settled",
    ]);
    expect(store.state.ledgerTxns.filter((entry) => entry.txn.kind === "release")).toHaveLength(0);
    expect(invariants(store)).toEqual([]);
  });

  test("an UNCLAIMED item only writes a warning audit row", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(
        payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.UNCLAIMED", {
          transactionStatus: "UNCLAIMED",
        }),
      ),
    );

    expect(result).toEqual({ duplicate: false, status: "processed" });
    expect(store.state.intents[0]?.status).toBe("submitted");
    expect(store.state.auditEvents.map((event) => event.type)).toEqual(["intent.unclaimed"]);
    expect(
      store.state.ledgerTxns.filter((entry) => entry.txn.kind === "settlePayout"),
    ).toHaveLength(0);
    expect(store.state.paypalObjects[0]?.status).toBe("UNCLAIMED");
  });

  test("a PENDING item stays submitted and is marked ignored", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(
        payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.ONHOLD", { transactionStatus: "ONHOLD" }),
      ),
    );

    expect(result.status).toBe("ignored");
    expect(store.state.intents[0]?.status).toBe("submitted");
  });
});

describe("webhook handler: batch events", () => {
  test("a DENIED batch fails and releases every submitted intent of the batch", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(
        payoutBatchEventPayload("PAYMENT.PAYOUTSBATCH.DENIED", { batchStatus: "DENIED" }),
      ),
    );

    expect(result.status).toBe("processed");
    expect(store.state.intents[0]?.status).toBe("released");
    expect(store.state.ledgerTxns.filter((entry) => entry.txn.kind === "release")).toHaveLength(1);
    expect(store.state.outboxEvents.map((event) => event.type)).toEqual(["leash.intent_failed"]);
    expect(store.state.paypalObjects[0]?.kind).toBe("payout_batch");
    expect(invariants(store)).toEqual([]);
  });

  test("a SUCCESS batch only records the batch state", async () => {
    const intent = submittedIntent();
    const { store, service } = build({
      intents: [intent],
      ledgerTxns: seedTxns(intent.id).map((txn) => ({ kittyId: KITTY_ID, txn })),
    });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(payoutBatchEventPayload("PAYMENT.PAYOUTSBATCH.SUCCESS")),
    );

    expect(result.status).toBe("processed");
    expect(store.state.intents[0]?.status).toBe("submitted");
    expect(store.state.ledgerTxns.filter((entry) => entry.txn.kind === "release")).toHaveLength(0);
    expect(store.state.paypalObjects).toHaveLength(1);
  });

  test("a DENIED batch with no submitted intent is stored as failed", async () => {
    const { store, service } = build({ intents: [] });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(
        payoutBatchEventPayload("PAYMENT.PAYOUTSBATCH.DENIED", { batchStatus: "DENIED" }),
      ),
    );

    expect(result.status).toBe("failed");
    expect(storedEvent(store, "WH-BATCH-0001")?.status).toBe("failed");
  });
});

describe("webhook handler: events Kitty does not handle yet", () => {
  test("an invoice event is stored and marked ignored", async () => {
    const { store, service } = build({ intents: [] });

    const result = await service.handleEvent(parsePaypalWebhookEvent(unknownEventPayload()));

    expect(result).toEqual({ duplicate: false, status: "ignored" });
    expect(store.state.webhookEvents).toEqual([
      expect.objectContaining({
        id: "WH-INVOICE-0001",
        eventType: "INVOICING.INVOICE.PAID",
        resourceId: "INV2-XYZ",
        status: "ignored",
      }),
    ]);
    expect(store.state.ledgerTxns).toHaveLength(0);
  });

  test("a payout item event for an unknown intent is stored as failed", async () => {
    const { store, service } = build({ intents: [] });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED")),
    );

    expect(result.status).toBe("failed");
    expect(storedEvent(store, "WH-2WR32451HC0233532-67976317FL4543714")?.status).toBe("failed");
    expect(store.state.ledgerTxns).toHaveLength(0);
  });

  test("a payout item event without sender_item_id is stored as failed", async () => {
    const intent = submittedIntent();
    const { store, service } = build({ intents: [intent] });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent(
        payoutItemEventPayload("PAYMENT.PAYOUTS-ITEM.SUCCEEDED", { senderItemId: null }),
      ),
    );

    expect(result.status).toBe("failed");
    expect(store.state.intents[0]?.status).toBe("submitted");
  });

  test("a payout event with a malformed resource is stored as failed", async () => {
    const { store, service } = build({ intents: [] });

    const result = await service.handleEvent(
      parsePaypalWebhookEvent({
        id: "WH-MALFORMED-1",
        event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
        resource_type: "payouts_item",
        resource: { unexpected: true },
      }),
    );

    expect(result.status).toBe("failed");
    expect(storedEvent(store, "WH-MALFORMED-1")?.status).toBe("failed");
  });
});
