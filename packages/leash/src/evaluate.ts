import type { ReasonCode } from "./reasons";
import type {
  Decision,
  DecisionReason,
  EvaluateInput,
  Leash,
  LeashStatus,
  RecentIntent,
  SpendIntent,
  Usage,
} from "./types";
import {
  DUPLICATE_WINDOW_MS,
  actionNeedsPayee,
  isCategoryAllowed,
  isMoneyAction,
  isPayeeAllowed,
  normalizePayee,
} from "./utils";

/** Reason code emitted for each non-active leash status (docs/05 §6 check 1). */
const INACTIVE_STATUS_CODES: Record<Exclude<LeashStatus, "active">, ReasonCode> = {
  paused: "LEASH_PAUSED",
  revoked: "LEASH_REVOKED",
  exhausted: "LEASH_EXHAUSTED",
  expired: "LEASH_EXPIRED",
};

function inactiveStatusReason(
  leashId: string,
  status: Exclude<LeashStatus, "active">,
): DecisionReason {
  return {
    code: INACTIVE_STATUS_CODES[status],
    details: `leash ${leashId} status is "${status}"`,
  };
}

/** Check 3: an ancestor must be active and inside its own validity window. */
function ancestorInactiveReason(ancestor: Leash, nowMs: number): DecisionReason | null {
  if (ancestor.status !== "active") {
    return {
      code: "PARENT_LEASH_INACTIVE",
      details: `ancestor ${ancestor.id} status is "${ancestor.status}"`,
    };
  }
  const notBeforeMs = Date.parse(ancestor.notBefore);
  if (Number.isNaN(notBeforeMs)) {
    return {
      code: "PARENT_LEASH_INACTIVE",
      details: `invalid date: ancestor ${ancestor.id} notBefore "${ancestor.notBefore}"`,
    };
  }
  const expiresAtMs = Date.parse(ancestor.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return {
      code: "PARENT_LEASH_INACTIVE",
      details: `invalid date: ancestor ${ancestor.id} expiresAt "${ancestor.expiresAt}"`,
    };
  }
  if (nowMs < notBeforeMs) {
    return {
      code: "PARENT_LEASH_INACTIVE",
      details: `ancestor ${ancestor.id} is not yet valid (notBefore ${ancestor.notBefore})`,
    };
  }
  if (nowMs >= expiresAtMs) {
    return {
      code: "PARENT_LEASH_INACTIVE",
      details: `ancestor ${ancestor.id} expired at ${ancestor.expiresAt}`,
    };
  }
  return null;
}

/** Check 13: same payee + amount within {@link DUPLICATE_WINDOW_MS}. */
function findDuplicate(
  intent: SpendIntent,
  payee: string,
  recentIntents: readonly RecentIntent[],
  nowMs: number,
): RecentIntent | null {
  const normalizedPayee = normalizePayee(payee);
  for (const prior of recentIntents) {
    if (prior.intentId === intent.intentId) {
      continue;
    }
    if (prior.amountCents !== intent.amountCents) {
      continue;
    }
    if (normalizePayee(prior.payee) !== normalizedPayee) {
      continue;
    }
    const delta = nowMs - Date.parse(prior.at);
    if (Number.isNaN(delta)) {
      // Unparseable timestamp: fail closed by treating it as inside the window.
      return prior;
    }
    if (delta < 0 || delta > DUPLICATE_WINDOW_MS) {
      continue;
    }
    return prior;
  }
  return null;
}

/**
 * Check 14: re-apply the ancestor-scoped dimensions (action, payee and category
 * allow-lists plus the per-tx and daily limits) using the ancestor's limits and
 * usage. One reason is emitted per violated dimension.
 *
 * The ancestor's own `availableCents` is intentionally **not** checked: money
 * is cut out of the parent at delegation (ledger `leash:parent:available →
 * leash:child:available`, docs/05 §7), so a parent that delegated its whole
 * balance still legitimately backs its child. `usage.spent24hCents` here is the
 * 24h spend of the ancestor's **whole subtree**.
 */
function ancestorLimitReasons(
  ancestor: Leash,
  usage: Usage,
  intent: SpendIntent,
): DecisionReason[] {
  const reasons: DecisionReason[] = [];
  const push = (details: string): void => {
    reasons.push({ code: "PARENT_LIMIT_EXCEEDED", details: `ancestor ${ancestor.id}: ${details}` });
  };

  if (!ancestor.allowedActions.includes(intent.action)) {
    push(`action "${intent.action}" is not allowed`);
  }

  if (actionNeedsPayee(intent.action)) {
    const payee = intent.payee;
    if (payee === undefined || payee.length === 0) {
      push(`action "${intent.action}" requires a payee`);
    } else if (!isPayeeAllowed(payee, ancestor.allowedPayees)) {
      push(`payee "${payee}" is not allowed`);
    }
  }

  if (
    intent.category !== undefined &&
    !isCategoryAllowed(intent.category, ancestor.allowedCategories)
  ) {
    push(`category "${intent.category}" is not allowed`);
  }

  if (intent.amountCents > ancestor.limits.perTxMaxCents) {
    push(`amountCents ${intent.amountCents} > perTxMaxCents ${ancestor.limits.perTxMaxCents}`);
  }

  if (usage.spent24hCents + intent.amountCents > ancestor.limits.dailyMaxCents) {
    push(
      `spent24hCents ${usage.spent24hCents} + amountCents ${intent.amountCents} > dailyMaxCents ${ancestor.limits.dailyMaxCents}`,
    );
  }

  return reasons;
}

/**
 * Pure, deterministic leash policy engine (docs/05 §6).
 *
 * Runs checks 1–14 in order, collecting **every** failure rather than stopping
 * at the first. It performs no I/O and never reads `intent.justification`
 * (AGENTS.md invariants #2 and #3); `now` is an input, so `Date.now()` is never
 * called.
 */
export function evaluate(input: EvaluateInput): Decision {
  const { leash, ancestors, intent, usage } = input;
  const reasons: DecisionReason[] = [];
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(nowMs)) {
    throw new RangeError(`evaluate received an invalid "now": ${input.now}`);
  }

  // 1. leash status
  if (leash.status !== "active") {
    reasons.push(inactiveStatusReason(leash.id, leash.status));
  }

  // 2. validity window (notBefore inclusive, expiresAt exclusive)
  const notBeforeMs = Date.parse(leash.notBefore);
  if (Number.isNaN(notBeforeMs)) {
    reasons.push({
      code: "LEASH_NOT_YET_VALID",
      details: `invalid date: leash ${leash.id} notBefore "${leash.notBefore}"`,
    });
  } else if (nowMs < notBeforeMs) {
    reasons.push({
      code: "LEASH_NOT_YET_VALID",
      details: `now ${input.now} is before notBefore ${leash.notBefore}`,
    });
  }
  const expiresAtMs = Date.parse(leash.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    reasons.push({
      code: "LEASH_EXPIRED",
      details: `invalid date: leash ${leash.id} expiresAt "${leash.expiresAt}"`,
    });
  } else if (nowMs >= expiresAtMs) {
    reasons.push({
      code: "LEASH_EXPIRED",
      details: `now ${input.now} is at or after expiresAt ${leash.expiresAt}`,
    });
  }

  // 3. ancestors active and inside their validity windows
  for (const ancestor of ancestors) {
    const reason = ancestorInactiveReason(ancestor, nowMs);
    if (reason !== null) {
      reasons.push(reason);
    }
  }

  // 4. currency
  if (intent.currency !== leash.currency) {
    reasons.push({
      code: "CURRENCY_MISMATCH",
      details: `intent currency "${intent.currency}" != leash currency "${leash.currency}"`,
    });
  }

  // 5. action allow-list
  if (!leash.allowedActions.includes(intent.action)) {
    reasons.push({
      code: "ACTION_NOT_ALLOWED",
      details: `action "${intent.action}" is not in allowedActions [${leash.allowedActions.join(", ")}]`,
    });
  }

  // 6. payee allow-list (only when the action needs a payee)
  if (actionNeedsPayee(intent.action)) {
    const payee = intent.payee;
    if (payee === undefined || payee.length === 0) {
      reasons.push({
        code: "PAYEE_NOT_ALLOWED",
        details: `action "${intent.action}" requires a payee`,
      });
    } else if (!isPayeeAllowed(payee, leash.allowedPayees)) {
      reasons.push({
        code: "PAYEE_NOT_ALLOWED",
        details: `payee "${payee}" is not in allowedPayees [${leash.allowedPayees.join(", ")}]`,
      });
    }
  }

  // 7. category allow-list (only when the intent names a category)
  if (
    intent.category !== undefined &&
    !isCategoryAllowed(intent.category, leash.allowedCategories)
  ) {
    reasons.push({
      code: "CATEGORY_NOT_ALLOWED",
      details: `category "${intent.category}" is not in allowedCategories [${leash.allowedCategories.join(", ")}]`,
    });
  }

  // 8. amount well-formedness
  if (isMoneyAction(intent.action)) {
    if (intent.amountCents <= 0n) {
      reasons.push({
        code: "INVALID_AMOUNT",
        details: `money action "${intent.action}" requires amountCents > 0 (got ${intent.amountCents})`,
      });
    }
  } else if (intent.amountCents !== 0n) {
    reasons.push({
      code: "INVALID_AMOUNT",
      details: `zero-amount action "${intent.action}" requires amountCents = 0 (got ${intent.amountCents})`,
    });
  }

  // 9. per-transaction limit
  if (intent.amountCents > leash.limits.perTxMaxCents) {
    reasons.push({
      code: "AMOUNT_EXCEEDS_PER_TX",
      details: `amountCents ${intent.amountCents} > perTxMaxCents ${leash.limits.perTxMaxCents}`,
    });
  }

  // 10. rolling 24h limit
  if (usage.spent24hCents + intent.amountCents > leash.limits.dailyMaxCents) {
    reasons.push({
      code: "DAILY_LIMIT_EXCEEDED",
      details: `spent24hCents ${usage.spent24hCents} + amountCents ${intent.amountCents} > dailyMaxCents ${leash.limits.dailyMaxCents}`,
    });
  }

  // 11. available balance
  if (intent.amountCents > usage.availableCents) {
    reasons.push({
      code: "INSUFFICIENT_LEASH_BALANCE",
      details: `amountCents ${intent.amountCents} > availableCents ${usage.availableCents}`,
    });
  }

  // 12. hourly rate limit
  if (usage.allowCountLastHour >= leash.limits.maxTxPerHour) {
    reasons.push({
      code: "RATE_LIMITED",
      details: `allowCountLastHour ${usage.allowCountLastHour} >= maxTxPerHour ${leash.limits.maxTxPerHour}`,
    });
  }

  // 13. possible duplicate → soft failure (step-up), never a hard denial alone
  const intentPayee = intent.payee;
  if (intentPayee !== undefined && intentPayee.length > 0) {
    const duplicate = findDuplicate(intent, intentPayee, usage.recentIntents, nowMs);
    if (duplicate !== null) {
      reasons.push({
        code: "POSSIBLE_DUPLICATE",
        details: `matches intent ${duplicate.intentId} (payee "${duplicate.payee}", amountCents ${duplicate.amountCents}, at ${duplicate.at})`,
      });
    }
  }

  // 14. ancestor limits (action, payee, category, per-tx, daily)
  for (const ancestor of ancestors) {
    const ancestorUsage = input.ancestorUsage[ancestor.id];
    if (ancestorUsage === undefined) {
      reasons.push({
        code: "PARENT_LIMIT_EXCEEDED",
        details: `usage for ancestor ${ancestor.id} missing`,
      });
      continue;
    }
    reasons.push(...ancestorLimitReasons(ancestor, ancestorUsage, intent));
  }

  const hasHardFailure = reasons.some((reason) => reason.code !== "POSSIBLE_DUPLICATE");
  if (hasHardFailure) {
    return { outcome: "DENY", reasons };
  }

  const stepUpReasons = [...reasons];
  if (leash.stepUpAboveCents !== null && intent.amountCents > leash.stepUpAboveCents) {
    stepUpReasons.push({
      code: "STEP_UP_REQUIRED",
      details: `amountCents ${intent.amountCents} > stepUpAboveCents ${leash.stepUpAboveCents}`,
    });
  }

  if (stepUpReasons.length > 0) {
    return { outcome: "STEP_UP", reasons: stepUpReasons };
  }

  return { outcome: "ALLOW" };
}
