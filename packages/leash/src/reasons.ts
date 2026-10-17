/**
 * Stable policy reason codes and their human-readable English messages
 * (docs/05-leash-spec.md §6, docs/15-ui-ux.md §4).
 *
 * Codes are machine contracts: the UI and agents switch on them, so they must
 * never change casually.
 */

/** Human-readable message for every {@link ReasonCode}. */
export const REASON_MESSAGES = {
  LEASH_NOT_ACTIVE: "This leash is not active.",
  LEASH_REVOKED: "This leash was revoked.",
  LEASH_PAUSED: "This leash is paused.",
  LEASH_EXHAUSTED: "This leash has no balance left.",
  LEASH_EXPIRED: "This leash has expired.",
  LEASH_NOT_YET_VALID: "This leash is not valid yet.",
  PARENT_LEASH_INACTIVE: "A parent leash is inactive or outside its validity window.",
  CURRENCY_MISMATCH: "The intent currency does not match the leash currency.",
  ACTION_NOT_ALLOWED: "This leash cannot perform that action.",
  PAYEE_NOT_ALLOWED: "The payee is not on this leash's approved payees.",
  CATEGORY_NOT_ALLOWED: "The category is not allowed on this leash.",
  INVALID_AMOUNT: "The amount is not valid for this action.",
  AMOUNT_EXCEEDS_PER_TX: "The amount exceeds the per-transaction limit.",
  DAILY_LIMIT_EXCEEDED: "The amount would exceed the rolling 24h limit.",
  INSUFFICIENT_LEASH_BALANCE: "The leash does not have enough available balance.",
  RATE_LIMITED: "Too many payments in the last hour.",
  POSSIBLE_DUPLICATE:
    "A matching payment was made in the last 10 minutes; step-up approval is required.",
  PARENT_LIMIT_EXCEEDED: "A parent leash limit was exceeded.",
  DELEGATION_EXCEEDS_PARENT: "A sub-leash cannot be broader than its parent leash.",
  STEP_UP_REQUIRED:
    "The amount exceeds the leash step-up threshold; organizer approval is required.",
} as const;

export type ReasonCode = keyof typeof REASON_MESSAGES;

/** Human-readable message for every {@link DelegationDetailCode}. */
export const DELEGATION_DETAIL_MESSAGES = {
  ALLOCATION: "The sub-leash allocation exceeds the parent's available balance.",
  PER_TX: "The sub-leash per-transaction limit exceeds the parent's.",
  DAILY: "The sub-leash daily limit exceeds the parent's.",
  RATE: "The sub-leash hourly rate limit exceeds the parent's.",
  ACTIONS: "The sub-leash allows actions the parent does not.",
  DELEGATE_NOT_ALLOWED: "The sub-leash may not delegate further (max depth 2).",
  PAYEES: "The sub-leash allows payees the parent does not.",
  CATEGORIES: "The sub-leash allows categories the parent does not.",
  EXPIRY: "The sub-leash expires after the parent.",
  STEP_UP: "The sub-leash step-up threshold is wider than the parent's.",
  DEPTH: "The parent is not a root leash, so a third level would be created.",
} as const;

export type DelegationDetailCode = keyof typeof DELEGATION_DETAIL_MESSAGES;
