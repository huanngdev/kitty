import type { Leash, LeashBalance } from "./types";
import { EMPTY_BALANCE } from "./utils";

/**
 * "Max possible loss" for the UI: the total an agent fleet could still move if
 * every active leash were drained, i.e. Σ (available + held) over active
 * leashes. Delegation moves money out of a parent's available bucket into the
 * child's, so summing every active leash never double-counts.
 */
export function maxPossibleLoss(
  leashes: readonly Leash[],
  balances: Readonly<Record<string, LeashBalance>>,
): bigint {
  return leashes.reduce((total, leash) => {
    if (leash.status !== "active") {
      return total;
    }
    const balance = balances[leash.id] ?? EMPTY_BALANCE;
    return total + balance.availableCents + balance.heldCents;
  }, 0n);
}
