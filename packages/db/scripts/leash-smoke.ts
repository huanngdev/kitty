/**
 * Integration smoke test for the `leash` schema (KIT-13).
 *
 * Run manually against the Neon dev branch — never in CI (it needs the pooled
 * `DATABASE_URL` of `apps/gateway/.env` and would otherwise write to a shared
 * database):
 *
 *   bun run db:smoke:leash
 *
 * Everything happens inside one transaction that is **rolled back** at the end,
 * so the dev database is left unchanged. Each step prints PASS / FAIL:
 *
 *   1. insert a kitty, an agent key and a leash
 *   2. post a `reserve` ledger transaction built with `@kitty/ledger`
 *   3. read the `account_balances` / `leash_balances` views
 *   4. confirm the append-only trigger rejects an `UPDATE` on `ledger_entries`
 *   5. confirm a duplicate `webhook_events.id` id raises a unique violation
 *   6. confirm the transaction left nothing behind
 */

import { reserve } from "@kitty/ledger";
import { eq } from "drizzle-orm";
import type { Db } from "../src/client";
import { createDb } from "../src/client";
import {
  accountBalances,
  agentKeys,
  kitties,
  leashBalances,
  leashes,
  ledgerEntries,
  webhookEvents,
} from "../src/schema/leash";

/** Marker error used to roll the smoke transaction back on purpose. */
const ROLLBACK_SENTINEL = "kitty-leash-smoke-rollback";

interface StepResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = "cause" in current ? current.cause : undefined;
  }

  return chain;
}

function errorCode(error: unknown): string | undefined {
  for (const link of errorChain(error)) {
    if ("code" in link && typeof link.code === "string") {
      return link.code;
    }
  }

  return undefined;
}

function errorMessage(error: unknown): string {
  let message = String(error);

  for (const link of errorChain(error)) {
    if (link instanceof Error) {
      message = link.message;
    }
  }

  return message;
}

function step(results: StepResult[], name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
}

async function runSmoke(db: Db, results: StepResult[]): Promise<void> {
  const kittyId = "kty_smoke_test";
  const agentId = "agt_smoke_test";
  const leashId = "lsh_smoke_test";
  const intentId = "int_smoke_test";
  const txnId = "txn_smoke_reserve";
  const webhookEventId = "evt_smoke_webhook";
  const amountCents = 12_345n;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(kitties).values({
        id: kittyId,
        eventId: "evt_smoke_kitty",
        ownerUserId: "usr_smoke_owner",
        currency: "USD",
        status: "open",
      });
      await tx.insert(agentKeys).values({
        agentId,
        kittyId,
        role: "shopper",
        publicKey: "smoke-public-key",
        status: "active",
      });
      step(results, "insert kitty + agent key", true, kittyId);

      await tx.insert(leashes).values({
        id: leashId,
        kittyId,
        agentId,
        currency: "USD",
        allocationCents: 100_000n,
        perTxMaxCents: 50_000n,
        dailyMaxCents: 80_000n,
        maxTxPerHour: 10,
        allowedActions: ["payout"],
        allowedPayees: ["vendor@example.com"],
        allowedCategories: ["*"],
        notBefore: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "active",
        createdBy: "usr_smoke_owner",
      });
      step(results, "insert leash", true, leashId);

      const txn = reserve({ txnId, leashId, amountCents, intentId });
      await tx.insert(ledgerEntries).values(
        txn.lines.map((line) => ({
          kittyId,
          txnId: txn.txnId,
          account: line.account,
          amountCents: line.amountCents,
          kind: txn.kind,
          ref: txn.intentId,
        })),
      );
      step(results, "post reserve ledger txn", true, `${txn.lines.length} balanced lines`);

      const balances = await tx
        .select()
        .from(accountBalances)
        .where(eq(accountBalances.kittyId, kittyId));
      const available = balances.find((row) => row.account === `leash:${leashId}:available`);
      const held = balances.find((row) => row.account === `leash:${leashId}:held`);
      step(
        results,
        "read account_balances view",
        available?.balanceCents === -amountCents && held?.balanceCents === amountCents,
        `available=${String(available?.balanceCents)} held=${String(held?.balanceCents)}`,
      );

      const perLeash = await tx
        .select()
        .from(leashBalances)
        .where(eq(leashBalances.kittyId, kittyId));
      const leashRow = perLeash.find((row) => row.leashId === leashId);
      step(
        results,
        "read leash_balances view",
        leashRow?.availableCents === -amountCents && leashRow?.heldCents === amountCents,
        `available=${String(leashRow?.availableCents)} held=${String(leashRow?.heldCents)}`,
      );

      let updateBlocked = false;
      let updateDetail = "UPDATE unexpectedly succeeded";
      try {
        await tx.transaction(async (inner) => {
          await inner
            .update(ledgerEntries)
            .set({ amountCents: amountCents + 1n })
            .where(eq(ledgerEntries.kittyId, kittyId));
        });
      } catch (error) {
        updateBlocked = errorCode(error) === "23001";
        updateDetail = `${errorCode(error) ?? "?"}: ${errorMessage(error)}`;
      }
      step(
        results,
        "append-only trigger rejects UPDATE ledger_entries",
        updateBlocked,
        updateDetail,
      );

      let duplicateRejected = false;
      let duplicateDetail = "duplicate insert unexpectedly succeeded";
      try {
        await tx.transaction(async (inner) => {
          const event = {
            id: webhookEventId,
            eventType: "PAYMENT.CAPTURE.COMPLETED",
            resourceId: "cap_smoke",
            verified: true,
            payload: { id: webhookEventId },
          };
          await inner.insert(webhookEvents).values(event);
          await inner.insert(webhookEvents).values(event);
        });
      } catch (error) {
        duplicateRejected = errorCode(error) === "23505";
        duplicateDetail = `${errorCode(error) ?? "?"}: ${errorMessage(error)}`;
      }
      step(
        results,
        "duplicate webhook event id rejected (unique violation)",
        duplicateRejected,
        duplicateDetail,
      );

      throw new Error(ROLLBACK_SENTINEL);
    });
  } catch (error) {
    if (errorMessage(error) !== ROLLBACK_SENTINEL) {
      step(results, "smoke transaction", false, errorMessage(error));
      return;
    }
  }

  const leftover = await db.select().from(kitties).where(eq(kitties.id, kittyId));
  step(
    results,
    "transaction rolled back (no leftover kitty)",
    leftover.length === 0,
    `rows=${leftover.length}`,
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    console.error(
      "FAIL  DATABASE_URL is not set — run `bun run db:smoke:leash` from the repo root",
    );
    process.exitCode = 1;
    return;
  }

  const db = createDb(databaseUrl);
  const results: StepResult[] = [];

  try {
    await runSmoke(db, results);
  } finally {
    await db.$client.end();
  }

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name} — ${result.detail}`);
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

await main();
