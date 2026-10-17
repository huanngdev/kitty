import {
  type ApprovalRow,
  type LeashRow,
  type PaypalObjectRow,
  type SpendIntentRow,
  approvals,
  leashes,
  paypalObjects,
  spendIntents,
} from "@kitty/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import type { DbLike } from "../../lib/db-types";
import { findLeashById, listLeashesByKitty } from "../leashes/leashes.repository";
import type { IntentUsageRow, LeashIdentity } from "../intents";

/**
 * Drizzle queries the agent MCP services need on top of the Admin API
 * repositories (CODE_RULES.md §D: repositories hold queries and nothing else).
 *
 * Where a query already exists (`findActiveLeashByAgent`, `leashBalance`,
 * `spent24hCents`, `listIntents`) it is **reused** from the leashes repository
 * so the agent surface and the admin surface can never drift apart.
 */

/** Every leash of the kitty, used to rebuild the delegation tree for policy. */
export async function listLeashIdentities(db: DbLike, kittyId: string): Promise<LeashIdentity[]> {
  const rows = await listLeashesByKitty(db, kittyId);

  return rows.map((row) => ({ id: row.id, parentId: row.parentId }));
}

/** Intent history of a kitty over a window, the input of the usage summary. */
export async function listIntentUsageRows(
  db: DbLike,
  kittyId: string,
  since: Date,
): Promise<IntentUsageRow[]> {
  return db
    .select({
      intentId: spendIntents.id,
      leashId: spendIntents.leashId,
      payee: spendIntents.payee,
      amountCents: spendIntents.amountCents,
      decision: spendIntents.decision,
      status: spendIntents.status,
      createdAt: spendIntents.createdAt,
    })
    .from(spendIntents)
    .innerJoin(leashes, eq(spendIntents.leashId, leashes.id))
    .where(and(eq(leashes.kittyId, kittyId), gte(spendIntents.createdAt, since)));
}

/**
 * The parent chain of a leash, ordered parent → root (docs/05 §9: delegation is
 * at most two levels; the depth guard only protects against a corrupted pointer).
 */
export async function findAncestorChain(db: DbLike, leashId: string): Promise<LeashRow[]> {
  const chain: LeashRow[] = [];
  let current = await findLeashById(db, leashId);

  for (let depth = 0; depth < 8 && current?.parentId != null; depth += 1) {
    const parent = await findLeashById(db, current.parentId);

    if (parent === undefined) {
      break;
    }

    chain.push(parent);
    current = parent;
  }

  return chain;
}

/** One intent, only when it belongs to the given leash (agents never read others). */
export async function findIntentForLeash(
  db: DbLike,
  intentId: string,
  leashId: string,
): Promise<SpendIntentRow | null> {
  const [row] = await db
    .select()
    .from(spendIntents)
    .where(and(eq(spendIntents.id, intentId), eq(spendIntents.leashId, leashId)))
    .limit(1);

  return row ?? null;
}

/** The last `limit` intents of one leash, newest first (docs/10 §2 `leash_activity`). */
export async function listRecentIntentsForLeash(
  db: DbLike,
  leashId: string,
  limit: number,
): Promise<SpendIntentRow[]> {
  return db
    .select()
    .from(spendIntents)
    .where(eq(spendIntents.leashId, leashId))
    .orderBy(desc(spendIntents.createdAt), desc(spendIntents.id))
    .limit(limit);
}

/** The pending/decided approval of an intent, when the decision was `STEP_UP`. */
export async function findApprovalByIntentId(
  db: DbLike,
  intentId: string,
): Promise<ApprovalRow | null> {
  const [row] = await db.select().from(approvals).where(eq(approvals.intentId, intentId)).limit(1);

  return row ?? null;
}

/** The PayPal object created for an intent (a payout batch), for status display. */
export async function findPaypalObjectForIntent(
  db: DbLike,
  intentId: string,
): Promise<PaypalObjectRow | null> {
  const [row] = await db
    .select()
    .from(paypalObjects)
    .where(eq(paypalObjects.intentId, intentId))
    .orderBy(desc(paypalObjects.updatedAt))
    .limit(1);

  return row ?? null;
}
