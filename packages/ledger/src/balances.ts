/**
 * Balances computed from ledger lines — the only way a balance is ever
 * produced (AGENTS.md invariant #5: balances always come from the ledger).
 *
 * A balance is `SUM(amount_cents)` over the lines of one account, so internal
 * buckets are never negative in a healthy ledger (invariant I2) and a member's
 * balance is negative while they have contributed more than they were refunded.
 */

import { accountKey, leashAvailable, leashHeld } from "./accounts";
import type { LedgerLine } from "./entries";

/** Sum of the lines of `account`; `0n` when the account never moved. */
export function balanceOf(lines: readonly LedgerLine[], account: string): bigint {
  let total = 0n;

  for (const line of lines) {
    if (line.account === account) {
      total += line.amountCents;
    }
  }

  return total;
}

/**
 * Balance of every account touched by `lines`, keyed by canonical account key.
 * Accounts that were never touched are absent (equivalent to `0n`).
 */
export function balances(lines: readonly LedgerLine[]): Map<string, bigint> {
  const result = new Map<string, bigint>();

  for (const line of lines) {
    const current = result.get(line.account) ?? 0n;
    result.set(line.account, current + line.amountCents);
  }

  return result;
}

/** The §2 leash view: money free to spend and money held for pending intents. */
export interface LeashBalance {
  readonly availableCents: bigint;
  readonly heldCents: bigint;
}

/**
 * Leash balance from the ledger (§2): `available = allocation − settled spend −
 * reserved`, where reserved money sits in the `held` bucket while an intent is
 * `awaiting_approval`, `reserved` or `submitted`.
 */
export function leashBalance(lines: readonly LedgerLine[], leashId: string): LeashBalance {
  return {
    availableCents: balanceOf(lines, accountKey(leashAvailable(leashId))),
    heldCents: balanceOf(lines, accountKey(leashHeld(leashId))),
  };
}
