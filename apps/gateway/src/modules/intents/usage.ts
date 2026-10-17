import type { RecentIntent, Usage } from "@kitty/leash";
import type { LeashBalance } from "@kitty/ledger";

/**
 * Pure usage computation for the policy engine (docs/05 §7).
 *
 * `evaluate` needs live usage from two sources: balances from the ledger and
 * intent history from `leash.spend_intents`. This module turns those rows into
 * the `Usage` (and per-ancestor `Usage`) shape the engine consumes. It is
 * deliberately free of I/O so it can be unit-tested directly.
 */

/** Rolling window for the daily limit (check #10). */
export const SPENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Rolling window for the hourly rate limit (check #12). */
export const RATE_WINDOW_MS = 60 * 60 * 1000;
/** Rolling window for duplicate detection (check #13). */
export const RECENT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Intent statuses whose amount counts toward `spent24hCents`: money that is
 * held or already left the leash. `denied`, `received`, `cancelled`, `failed`
 * and `released` do not count — no money is committed by them.
 */
export const SPENDING_STATUSES: readonly string[] = [
  "reserved",
  "awaiting_approval",
  "submitted",
  "settled",
];

/** Decisions that count toward `allowCountLastHour` (check #12). */
export const COUNTED_DECISIONS: readonly string[] = ["ALLOW", "STEP_UP"];

/** The minimal shape of a leash needed to rebuild the tree. */
export interface LeashIdentity {
  readonly id: string;
  readonly parentId: string | null;
}

/** One historical intent, as read from `leash.spend_intents`. */
export interface IntentUsageRow {
  readonly intentId: string;
  readonly leashId: string;
  readonly payee: string | null;
  readonly amountCents: bigint;
  readonly decision: string;
  readonly status: string;
  readonly createdAt: Date;
}

export interface SummarizeUsageInput {
  /** The leash that will spend, the one the engine scores. */
  readonly targetLeashId: string;
  /** Parent chain of the target, ordered parent → root. */
  readonly ancestors: readonly LeashIdentity[];
  /** Every leash of the kitty, used to compute ancestor subtrees. */
  readonly leashes: readonly LeashIdentity[];
  /** Intent history for the kitty, over at least the last 24h. */
  readonly intents: readonly IntentUsageRow[];
  /** Leash balances read from the ledger (`leash_balances`). */
  readonly balances: ReadonlyMap<string, LeashBalance>;
  readonly now: Date;
}

export interface UsageSummary {
  readonly usage: Usage;
  readonly ancestorUsage: Readonly<Record<string, Usage>>;
}

function parentOfMap(leashes: readonly LeashIdentity[]): ReadonlyMap<string, string | null> {
  const parents = new Map<string, string | null>();

  for (const leash of leashes) {
    parents.set(leash.id, leash.parentId);
  }

  return parents;
}

/** True when `leashId` is `ancestorId` itself or one of its descendants. */
function isInSubtree(
  leashId: string,
  ancestorId: string,
  parents: ReadonlyMap<string, string | null>,
): boolean {
  let current: string | null | undefined = leashId;
  const seen = new Set<string>();

  while (current !== undefined && current !== null) {
    if (current === ancestorId) {
      return true;
    }
    if (seen.has(current)) {
      // Guard against a corrupted tree rather than looping forever.
      return false;
    }
    seen.add(current);
    current = parents.get(current);
  }

  return false;
}

/**
 * Builds the `Usage` for a leash and one for each of its ancestors.
 *
 * The leash's own usage is scoped to itself: its available balance (check #11),
 * its own 24h spend (check #10) and its own hourly decision count (check #12).
 * Each ancestor's `spent24hCents` and `allowCountLastHour` cover that ancestor's
 * **whole subtree** (check #14), while its `availableCents` is informational —
 * money is cut out of the parent at delegation, so the engine ignores it.
 */
export function summarizeUsage(input: SummarizeUsageInput): UsageSummary {
  const parents = parentOfMap(input.leashes);
  const spentSinceMs = input.now.getTime() - SPENT_WINDOW_MS;
  const rateSinceMs = input.now.getTime() - RATE_WINDOW_MS;
  const recentSinceMs = input.now.getTime() - RECENT_WINDOW_MS;

  const balanceOf = (leashId: string): bigint => input.balances.get(leashId)?.availableCents ?? 0n;

  let ownSpent24hCents = 0n;
  let ownAllowCountLastHour = 0;
  const recentIntents: RecentIntent[] = [];

  for (const intent of input.intents) {
    const atMs = intent.createdAt.getTime();
    const isTarget = intent.leashId === input.targetLeashId;

    if (isTarget && SPENDING_STATUSES.includes(intent.status) && atMs >= spentSinceMs) {
      ownSpent24hCents += intent.amountCents;
    }

    if (isTarget && COUNTED_DECISIONS.includes(intent.decision) && atMs >= rateSinceMs) {
      ownAllowCountLastHour += 1;
    }

    if (isTarget && intent.payee !== null && atMs >= recentSinceMs) {
      recentIntents.push({
        intentId: intent.intentId,
        payee: intent.payee,
        amountCents: intent.amountCents,
        at: intent.createdAt.toISOString(),
      });
    }
  }

  const usage: Usage = {
    availableCents: balanceOf(input.targetLeashId),
    spent24hCents: ownSpent24hCents,
    allowCountLastHour: ownAllowCountLastHour,
    recentIntents,
  };

  const ancestorUsage: Record<string, Usage> = {};

  for (const ancestor of input.ancestors) {
    let subtreeSpent24hCents = 0n;
    let subtreeAllowCountLastHour = 0;

    for (const intent of input.intents) {
      if (!isInSubtree(intent.leashId, ancestor.id, parents)) {
        continue;
      }
      const atMs = intent.createdAt.getTime();

      if (SPENDING_STATUSES.includes(intent.status) && atMs >= spentSinceMs) {
        subtreeSpent24hCents += intent.amountCents;
      }
      if (COUNTED_DECISIONS.includes(intent.decision) && atMs >= rateSinceMs) {
        subtreeAllowCountLastHour += 1;
      }
    }

    ancestorUsage[ancestor.id] = {
      availableCents: balanceOf(ancestor.id),
      spent24hCents: subtreeSpent24hCents,
      allowCountLastHour: subtreeAllowCountLastHour,
      recentIntents: [],
    };
  }

  return { usage, ancestorUsage };
}
