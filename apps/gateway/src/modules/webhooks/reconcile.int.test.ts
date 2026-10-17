import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Db, createDb } from "@kitty/db";
import { ledgerEntries, paypalObjects, spendIntents } from "@kitty/db/schema";
import { checkInvariants } from "@kitty/ledger";
import { eq } from "drizzle-orm";
import { getPayoutExecutor, getPayoutStatusReader } from "../../lib/paypal";
import { createDrizzleIntentsStore } from "../intents/intents.repository";
import { createIntentsService } from "../intents/intents.service";
import { spendIntent } from "../intents/test-support/fixtures";
import { createReconcileService } from "./reconcile.service";
import { loadTxns, runSuffix, seedFundedLeash } from "./test-support/int-db";
import { createDrizzleWebhooksStore } from "./webhooks.repository";

/**
 * Integration test for the reconcile sweep against the **PayPal sandbox**
 * (docs/10 §6, docs/11 §4).
 *
 * Not part of CI: it needs `DATABASE_URL`, real sandbox credentials, and it
 * makes a live $1 payout. Run with:
 *
 *   bun run --filter gateway test:integration
 *
 * It seeds a funded leash, lets KIT-16 `reserveIntent` create the payout, then
 * runs the sweep until PayPal reports the item SUCCESS — the no-webhook path.
 */

const databaseUrl = process.env.DATABASE_URL;
const payeeEmail = process.env.PAYPAL_SANDBOX_PAYEE_EMAIL;
const hasPayPal = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const AMOUNT_CENTS = 100n;
const ALLOCATION_CENTS = 500n;
const POLL_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;
const INTEGRATION_TIMEOUT_MS = POLL_TIMEOUT_MS + 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe.skipIf(databaseUrl === undefined || payeeEmail === undefined || !hasPayPal)(
  "reconcile sweep against the PayPal sandbox (integration)",
  () => {
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

    test(
      "a live $1 payout settles through the sweep and is a no-op the second time",
      async () => {
        const run = runSuffix();
        const kittyId = `kty_it_reconcile_${run}`;
        const agentId = `agt_it_reconcile_${run}`;
        const leashId = `lsh_it_reconcile_${run}`;
        const intentId = `int_it_reconcile_${run}`;
        const payee = payeeEmail ?? "";

        await seedFundedLeash(db, {
          kittyId,
          agentId,
          leashId,
          allocationCents: ALLOCATION_CENTS,
          allowedPayees: [payee],
        });

        // --- live payout through KIT-16 reserveIntent
        const intents = createIntentsService({
          store: createDrizzleIntentsStore(db),
          payouts: getPayoutExecutor(),
          now: () => new Date(),
        });

        const reserved = await intents.reserveIntent({
          agentId,
          request: spendIntent({
            intentId,
            action: "payout",
            amountCents: AMOUNT_CENTS,
            payee,
            memo: `KIT-7 reconcile check ${run}`,
          }),
        });

        expect(reserved.decision.outcome).toBe("ALLOW");

        const submitted = await db.select().from(spendIntents).where(eq(spendIntents.id, intentId));
        const batchId = submitted[0]?.paypalRef;

        expect(submitted[0]?.status).toBe("submitted");
        expect(batchId).toBeDefined();

        // --- the item lookup key the webhook/reconcile path depends on
        const batch = await getPayoutStatusReader().getBatch({ batchId: batchId ?? "" });

        expect(batch.items).toHaveLength(1);
        expect(batch.items[0]?.senderItemId).toBe(intentId);
        expect(batch.items[0]?.amountCents).toBe(AMOUNT_CENTS);

        // --- reconcile until PayPal reports a final state
        const reconcile = createReconcileService({
          store: createDrizzleWebhooksStore(db),
          payouts: getPayoutStatusReader(),
          now: () => new Date(),
        });

        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let status = "submitted";

        while (Date.now() < deadline) {
          // A large limit keeps this robust on a shared dev branch, where other
          // tests may have left intents in `submitted`.
          await reconcile.reconcile({ olderThanMinutes: 0, limit: 50 });

          const rows = await db.select().from(spendIntents).where(eq(spendIntents.id, intentId));
          status = rows[0]?.status ?? "missing";

          if (status === "settled" || status === "released") {
            break;
          }

          await sleep(POLL_INTERVAL_MS);
        }

        expect(status).toBe("settled");

        // --- ledger: held → external:payee, balances consistent
        const txns = await loadTxns(db, kittyId);

        expect(checkInvariants(txns, { kittyOfLeash: new Map([[leashId, kittyId]]) })).toEqual([]);
        expect(txns.filter((txn) => txn.kind === "settlePayout")).toHaveLength(1);

        const settle = txns.find((txn) => txn.kind === "settlePayout");
        expect(settle?.lines).toEqual([
          { account: `leash:${leashId}:held`, amountCents: -AMOUNT_CENTS },
          { account: `external:payee:${payee}`, amountCents: AMOUNT_CENTS },
        ]);

        const heldLines = (
          await db.select().from(ledgerEntries).where(eq(ledgerEntries.kittyId, kittyId))
        ).filter((row) => row.account === `leash:${leashId}:held`);
        const heldTotal = heldLines.reduce((sum, row) => sum + row.amountCents, 0n);

        expect(heldTotal).toBe(0n);

        // --- running the sweep again changes nothing for this intent: the
        // shared dev branch may contain other stale intents, so the assertion
        // is on this kitty's ledger rather than the sweep counters.
        const txnsBefore = await loadTxns(db, kittyId);

        await reconcile.reconcile({ olderThanMinutes: 0, limit: 50 });

        expect(await loadTxns(db, kittyId)).toEqual(txnsBefore);

        const after = await db.select().from(spendIntents).where(eq(spendIntents.id, intentId));
        expect(after[0]?.status).toBe("settled");

        const itemObjects = await db
          .select()
          .from(paypalObjects)
          .where(eq(paypalObjects.intentId, intentId));

        expect(
          itemObjects.some((row) => row.kind === "payout_item" && row.status === "SUCCESS"),
        ).toBe(true);
      },
      INTEGRATION_TIMEOUT_MS,
    );
  },
);
