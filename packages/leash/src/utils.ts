import {
  CATEGORY_WILDCARD,
  MONEY_ACTIONS,
  PAYEE_ACTIONS,
  ZERO_AMOUNT_ACTIONS,
  type Action,
  type AllowedCategories,
  type Category,
  type LeashBalance,
} from "./types";

/** Rolling window in which a matching intent counts as a possible duplicate. */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/** Literal payee entry that matches any `member:<id>`. */
export const MEMBER_WILDCARD = "member:*";

/** Balance assumed when the caller did not provide one for a leash. */
export const EMPTY_BALANCE: LeashBalance = { availableCents: 0n, heldCents: 0n };

const moneyActions: ReadonlySet<Action> = new Set(MONEY_ACTIONS);
const zeroAmountActions: ReadonlySet<Action> = new Set(ZERO_AMOUNT_ACTIONS);
const payeeActions: ReadonlySet<Action> = new Set(PAYEE_ACTIONS);

/** True when the action moves money and requires `amountCents > 0`. */
export function isMoneyAction(action: Action): boolean {
  return moneyActions.has(action);
}

/** True when the action carries no amount and requires `amountCents === 0`. */
export function isZeroAmountAction(action: Action): boolean {
  return zeroAmountActions.has(action);
}

/** True when the intent for this action must name a payee. */
export function actionNeedsPayee(action: Action): boolean {
  return payeeActions.has(action);
}

/** Case-insensitive, trimmed normalisation used for every payee comparison. */
export function normalizePayee(payee: string): string {
  return payee.trim().toLowerCase();
}

/**
 * True when `payee` is covered by `allowedPayees`. Comparison is
 * case-insensitive; the literal `member:*` matches any `member:<id>`.
 */
export function isPayeeAllowed(payee: string, allowedPayees: readonly string[]): boolean {
  const normalized = normalizePayee(payee);
  return allowedPayees.some((allowed) => {
    const candidate = normalizePayee(allowed);
    if (candidate === normalized) {
      return true;
    }
    return candidate === MEMBER_WILDCARD && normalized.startsWith("member:");
  });
}

/** True when the allow-list is the singular wildcard `["*"]`. */
export function isCategoryWildcard(
  allowed: AllowedCategories,
): allowed is readonly [typeof CATEGORY_WILDCARD] {
  return allowed.length === 1 && allowed[0] === CATEGORY_WILDCARD;
}

/** True when `category` is covered by the allow-list (wildcard allows all). */
export function isCategoryAllowed(category: Category, allowed: AllowedCategories): boolean {
  if (isCategoryWildcard(allowed)) {
    return true;
  }
  return allowed.includes(category);
}
