import type { ReasonCode } from "./reasons";

/**
 * Domain types for the leash policy engine (docs/05-leash-spec.md §2).
 *
 * Money is always an integer number of cents (`bigint`) inside the domain
 * (AGENTS.md invariant #4). docs/05 shows money as a decimal string — that is
 * the wire format only. Every money field here is named `…Cents`.
 */

/** The seven leash actions (docs/05 §3). */
export const ACTIONS = [
  "payout",
  "create_invoice",
  "send_reminder",
  "create_order",
  "refund",
  "delegate",
  "browser_booking",
] as const;

export type Action = (typeof ACTIONS)[number];

/** Actions that move money, so `amountCents` must be strictly positive. */
export const MONEY_ACTIONS = [
  "payout",
  "create_invoice",
  "create_order",
  "refund",
  "delegate",
] as const;

export type MoneyAction = (typeof MONEY_ACTIONS)[number];

/** Actions that never carry an amount, so `amountCents` must be exactly 0. */
export const ZERO_AMOUNT_ACTIONS = ["send_reminder", "browser_booking"] as const;

export type ZeroAmountAction = (typeof ZERO_AMOUNT_ACTIONS)[number];

/** Actions whose intent must name a payee. */
export const PAYEE_ACTIONS = ["payout", "refund", "create_invoice"] as const;

export type PayeeAction = (typeof PAYEE_ACTIONS)[number];

/**
 * Budget categories (docs/09-data-model.md `app.budget_lines`, docs/04). The
 * engine also accepts the wildcard `["*"]` via {@link AllowedCategories}.
 */
export const CATEGORIES = [
  "lodging",
  "food",
  "transport",
  "gear",
  "merch",
  "activities",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Wildcard entry that allows every category. */
export const CATEGORY_WILDCARD = "*" as const;

/** A category allow-list: a concrete list, or the single wildcard `["*"]`. */
export type AllowedCategories = readonly Category[] | readonly [typeof CATEGORY_WILDCARD];

/** Leash lifecycle statuses (docs/05 §11). */
export const LEASH_STATUSES = ["active", "paused", "revoked", "expired", "exhausted"] as const;

export type LeashStatus = (typeof LEASH_STATUSES)[number];

/**
 * ISO-4217 currency code. MVP settles in USD only (docs/05 §2), but the policy
 * engine still guards against a mismatch (check #4), so the type stays open.
 */
export type Currency = string;

/** The only currency the MVP supports. */
export const DEFAULT_CURRENCY = "USD" as const;

/** Rolling limits attached to a leash. All money is integer cents. */
export interface LeashLimits {
  /** Maximum for a single intent. */
  perTxMaxCents: bigint;
  /** Maximum settled spend within a rolling 24h window. */
  dailyMaxCents: bigint;
  /** Maximum number of ALLOWed intents per rolling hour. */
  maxTxPerHour: number;
}

/** A leash grant (docs/05 §2) with money in integer cents. */
export interface Leash {
  /** `lsh_` + ULID. */
  id: string;
  kittyId: string;
  /** Parent leash id for a sub-leash, `null` for a root leash. */
  parentId: string | null;
  agentId: string;
  /** Ed25519 public key, base64url. */
  agentPublicKey: string;
  currency: Currency;
  /** Total amount granted; the bounded-loss ceiling. */
  allocationCents: bigint;
  limits: LeashLimits;
  allowedActions: Action[];
  /** Lowercase PayPal emails or `member:*`. */
  allowedPayees: string[];
  allowedCategories: AllowedCategories;
  /** Amount above which a step-up approval is required, or `null` for never. */
  stepUpAboveCents: bigint | null;
  /** ISO-8601. Valid from this instant (inclusive). */
  notBefore: string;
  /** ISO-8601. Valid until this instant (exclusive). */
  expiresAt: string;
  status: LeashStatus;
  /** Organizer user id, or the parent agent id for a delegated leash. */
  createdBy: string;
  createdAt: string;
}

/** A spend intent as seen by the policy engine (docs/05 §4). */
export interface SpendIntent {
  /** Agent-generated `int_` + ULID; the end-to-end idempotency key. */
  intentId: string;
  action: Action;
  amountCents: bigint;
  currency: Currency;
  /** Lowercase payee email or `member:<id>`; required by some actions. */
  payee?: string;
  category?: Category;
  memo: string;
  taskId?: string;
  /**
   * Free-form agent explanation. Display/audit only — the policy engine must
   * never read it (AGENTS.md invariant #2).
   */
  justification: string;
}

/** A recently seen intent used for duplicate detection. */
export interface RecentIntent {
  intentId: string;
  payee: string;
  amountCents: bigint;
  at: string;
}

/** Live usage of a leash, computed from the ledger by the caller. */
export interface Usage {
  /**
   * Balance available to the leash itself (check #11). Ignored for ancestors:
   * money is cut out of the parent at delegation, so an ancestor's own
   * available balance never gates a child intent.
   */
  availableCents: bigint;
  /**
   * Settled spend in the rolling 24h window. For an ancestor this is the 24h
   * spend of that ancestor's **whole subtree** (check #14); for the leash
   * itself it is its own 24h spend (check #10).
   */
  spent24hCents: bigint;
  allowCountLastHour: number;
  recentIntents: RecentIntent[];
}

/** Everything the pure policy engine needs to decide one intent. */
export interface EvaluateInput {
  leash: Leash;
  /** Parent chain ordered parent → root; empty for a root leash. */
  ancestors: readonly Leash[];
  intent: SpendIntent;
  usage: Usage;
  /**
   * Usage per ancestor leash id — required to enforce ancestor limits (check
   * #14). `spent24hCents` must be the 24h spend of that ancestor's whole
   * subtree; the entry's `availableCents` is ignored (money is cut out of the
   * parent at delegation). A missing entry fails closed with
   * `PARENT_LIMIT_EXCEEDED` rather than being treated as zero usage.
   */
  ancestorUsage: Readonly<Record<string, Usage>>;
  /**
   * Evaluation time, ISO-8601. The engine is pure: it never calls `Date.now()`.
   * A malformed value is a programmer error and throws a `RangeError`.
   */
  now: string;
}

/** A single policy failure with a stable machine code and human-readable detail. */
export interface DecisionReason {
  code: ReasonCode;
  details: string;
}

/** Policy outcome for one intent. */
export type Decision =
  | { outcome: "ALLOW" }
  | { outcome: "STEP_UP"; reasons: DecisionReason[] }
  | { outcome: "DENY"; reasons: DecisionReason[] };

export type Outcome = Decision["outcome"];

/** Available and held buckets of one leash, used for the bounded-loss number. */
export interface LeashBalance {
  availableCents: bigint;
  heldCents: bigint;
}
