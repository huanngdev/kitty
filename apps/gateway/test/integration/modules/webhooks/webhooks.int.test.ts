import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Db, createDb } from "@kitty/db";
import { spendIntents, webhookEvents } from "@kitty/db/schema";
import { checkInvariants } from "@kitty/ledger";
import { parsePaypalWebhookEvent } from "@kitty/paypal";
import { eq } from "drizzle-orm";
import { createDrizzleIntentsStore } from "../../../../src/modules/intents/intents.repository";
import { createIntentsService } from "../../../../src/modules/intents/intents.service";
import { spendIntent, type FakePayouts } from "../../../support/intents/fixtures";
import { createFakePayouts } from "../../../support/intents/fixtures";
import { loadTxns, runSuffix, seedFundedLeash } from "../../../support/webhooks/int-db";
import { createDrizzleWebhooksStore } from "../../../../src/modules/webhooks/webhooks.repository";
import { createWebhooksService } from "../../../../src/modules/webhooks/webhooks.service";

/**
 * Integration test of the webhook handler against **real Postgres**
 * (docs/10 §5, docs/11 §3).
 *
 * Not part of CI: it needs `DATABASE_URL`. It deliberately needs no PayPal
 * credentials and no public URL — the payout is created through a fake executor
 * and the event goes straight into the handler, so the things only a real
 * database can prove are covered: the `ON CONFLICT` dedupe on
 * `leash.webhook_events` and the `FOR UPDATE` lock on the intent row.
 *
 * Run with: `bun run --filter gateway test:integration`
 */

const databaseUrl = process.env.DATABASE_URL;
const AMOUNT_CENTS = 100n;
const ALLOCATION_CENTS = 500n;
const BATCH_ID = "BATCH-IT-WEBHOOK";

function payoutItemEventPayload(input: {
  eventId: string;
  intentId: string;
  batchId: string;
  itemId: string;
}): unknown {
  return {
    id: input.eventId,
    create_time: "2026-10-17T10:00:00Z",
    resource_type: "payouts_item",
    event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
    resource: {
      payout_item_id: input.itemId,
      transaction_id: "TX-IT-1",
      transaction_status: "SUCCESS",
      payout_batch_id: input.batchId,
      payout_item_fee: { currency: "USD", value: "0.25" },
      payout_item: {
        amount: { currency: "USD", value: "1.00" },
        receiver: "payee@example.com",
        sender_item_id: input.intentId,
      },
    },
  };
}

describe.skipIf(databaseUrl === undefined)("webhook handler (integration)", () => {
  let db: Db;

  beforeAll(() => {
    if (databaseUrl === undefined) {
      throw new Error("DATABASE_URL is required for the integration tests");
    }

    db = createDb(databaseUrl);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  test("a verified payout item settles the intent exactly once", async () => {
    const run = runSuffix();
    const kittyId = `kty_it_webhook_${run}`;
    const agentId = `agt_it_webhook_${run}`;
    const leashId = `lsh_it_webhook_${run}`;
    const intentId = `int_it_webhook_${run}`;
    const payee = `vendor-${run}@example.com`;

    await seedFundedLeash(db, {
      kittyId,
      agentId,
      leashId,
      allocationCents: ALLOCATION_CENTS,
      allowedPayees: [payee],
    });

    // A fake executor keeps this test offline: only the DB path is under test.
    const payouts: FakePayouts = createFakePayouts();

    payouts.succeedWith({ batchId: BATCH_ID, status: "PENDING" });

    const intents = createIntentsService({
      store: createDrizzleIntentsStore(db),
      payouts: payouts.executor,
      now: () => new Date(),
    });

    const reserved = await intents.reserveIntent({
      agentId,
      request: spendIntent({
        intentId,
        action: "payout",
        amountCents: AMOUNT_CENTS,
        payee,
        memo: `KIT-7 webhook check ${run}`,
      }),
    });

    expect(reserved.decision.outcome).toBe("ALLOW");
    expect(reserved.status).toBe("submitted");

    const webhooks = createWebhooksService({ store: createDrizzleWebhooksStore(db) });
    const payload = payoutItemEventPayload({
      eventId: `WH-IT-${run}`,
      intentId,
      batchId: BATCH_ID,
      itemId: `ITEM-IT-${run}`,
    });

    const first = await webhooks.handleEvent(parsePaypalWebhookEvent(payload));
    const second = await webhooks.handleEvent(parsePaypalWebhookEvent(payload));

    expect(first).toEqual({ duplicate: false, status: "processed" });
    // The same event id again: PayPal's retry must not move money twice.
    expect(second).toEqual({ duplicate: true, status: "ignored" });

    const intentRows = await db.select().from(spendIntents).where(eq(spendIntents.id, intentId));
    expect(intentRows[0]?.status).toBe("settled");

    const txns = await loadTxns(db, kittyId);
    expect(checkInvariants(txns, { kittyOfLeash: new Map([[leashId, kittyId]]) })).toEqual([]);
    expect(txns.filter((txn) => txn.kind === "settlePayout")).toHaveLength(1);

    const events = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, `WH-IT-${run}`));
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("processed");
    expect(events[0]?.verified).toBe(true);
    expect(events[0]?.processedAt).not.toBeNull();
    expect(events[0]?.resourceId).toBe(`ITEM-IT-${run}`);
  });
});
