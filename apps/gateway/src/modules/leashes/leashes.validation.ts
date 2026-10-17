import { type LeashStatus } from "@kitty/leash";
import { parseMoney } from "@kitty/ledger";
import { errorCodes } from "@kitty/shared";
import { type CreateLeashInput } from "@kitty/shared/leash-admin";
import { AppError } from "../../lib/errors";

/**
 * Pure create-time validation of a leash (docs/10-api-spec.md §1,
 * docs/05-leash-spec.md §2/§9/§11).
 *
 * These functions never touch the database, so they are unit-tested directly;
 * the service only supplies the ledger/DB facts they need.
 */

/** Leashes may not live longer than 30 days (docs/10 §1 `EXPIRY_TOO_LONG`). */
export const MAX_LEASH_LIFETIME_DAYS = 30;

/** The only non-email payee token: every member of the event. */
export const MEMBER_WILDCARD = "member:*";

/**
 * Actions a leash may carry when it names `member:*`. `member:*` is allowed for
 * `create_invoice`/`refund` only: it can never be combined with an action that
 * pays an external vendor (`payout`, `create_order`, `delegate`,
 * `browser_booking`). `send_reminder` names no payee, so it is accepted too.
 */
const MEMBER_WILDCARD_ALLOWED_ACTIONS: readonly string[] = [
  "create_invoice",
  "refund",
  "send_reminder",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Leash status transitions the admin API may request (docs/05 §11). */
export type LeashTransition = "pause" | "resume" | "topup" | "revoke";

const ALLOWED_FROM: Record<LeashTransition, readonly LeashStatus[]> = {
  pause: ["active"],
  resume: ["paused"],
  topup: ["active", "paused", "exhausted"],
  revoke: ["active", "paused", "exhausted"],
};

/** The normalized, cents-valued leash spec produced from a create request. */
export interface LeashSpecCents {
  readonly allocationCents: bigint;
  readonly perTxMaxCents: bigint;
  readonly dailyMaxCents: bigint;
  readonly maxTxPerHour: number;
  readonly stepUpAboveCents: bigint | null;
  readonly notBefore: Date;
  readonly expiresAt: Date;
  readonly allowedPayees: string[];
}

export interface ValidateCreateLeashContext {
  readonly kittyAvailableCents: bigint;
  readonly verifiedPayees: readonly string[];
  readonly hasActiveLeashForAgent: boolean;
  readonly now: Date;
}

function invalidLimits(reason: string, details: Record<string, unknown> = {}): AppError {
  return new AppError(errorCodes.invalidLeashLimits, 400, { reason, ...details });
}

/**
 * Assigns each payee to the leash after checking it is organizer-verified.
 *
 * `member:*` is returned as-is (it is not an email). Any other value must be a
 * lowercase email present in `verifiedPayees` (AGENTS.md invariant #12),
 * otherwise `PAYEE_NOT_VERIFIED`.
 */
export function resolveAllowedPayees(
  allowedPayees: readonly string[],
  allowedActions: readonly string[],
  verifiedPayees: readonly string[],
): string[] {
  const verified = new Set(verifiedPayees.map((email) => email.toLowerCase()));
  const resolved: string[] = [];

  for (const rawPayee of allowedPayees) {
    const payee = rawPayee.trim().toLowerCase();

    if (payee === MEMBER_WILDCARD) {
      for (const action of allowedActions) {
        if (!MEMBER_WILDCARD_ALLOWED_ACTIONS.includes(action)) {
          throw new AppError(errorCodes.badRequest, 400, {
            reason: "member_wildcard_actions",
            payee: MEMBER_WILDCARD,
            action,
          });
        }
      }

      resolved.push(payee);
      continue;
    }

    if (!EMAIL_PATTERN.test(payee)) {
      throw new AppError(errorCodes.payeeNotVerified, 400, { payee, reason: "not_an_email" });
    }

    if (!verified.has(payee)) {
      throw new AppError(errorCodes.payeeNotVerified, 400, { payee });
    }

    resolved.push(payee);
  }

  return resolved;
}

function parseExpiry(value: string): Date {
  const expiresAt = new Date(value);

  if (Number.isNaN(expiresAt.getTime())) {
    throw new AppError(errorCodes.invalidExpiry, 400, { expiresAt: value });
  }

  return expiresAt;
}

/**
 * Validates a `POST /v1/leashes` body against the ledger facts of its kitty and
 * returns the cents-valued spec. Throws an `AppError` with the shared error
 * code the moment a rule is broken.
 */
export function validateCreateLeashSpec(
  input: CreateLeashInput,
  context: ValidateCreateLeashContext,
): LeashSpecCents {
  // MVP rule: one active leash per agent (docs/10 §1 `AGENT_ALREADY_LEASHED`).
  // Checked first so it is not masked by an allocation error.
  if (context.hasActiveLeashForAgent) {
    throw new AppError(errorCodes.agentAlreadyLeashed, 409, { agentId: input.agentId });
  }

  const allocationCents = parseMoney(input.allocation);
  const perTxMaxCents = parseMoney(input.limits.perTxMax);
  const dailyMaxCents = parseMoney(input.limits.dailyMax);
  const stepUpAboveCents = input.stepUpAbove === null ? null : parseMoney(input.stepUpAbove);

  if (allocationCents > context.kittyAvailableCents) {
    throw new AppError(errorCodes.allocationExceedsKittyAvailable, 409, {
      allocationCents: allocationCents.toString(),
      kittyAvailableCents: context.kittyAvailableCents.toString(),
    });
  }

  if (allocationCents > 0n && perTxMaxCents > allocationCents) {
    throw invalidLimits("per_tx_exceeds_allocation", {
      allocationCents: allocationCents.toString(),
    });
  }

  if (allocationCents > 0n && dailyMaxCents > allocationCents) {
    throw invalidLimits("daily_exceeds_allocation", {
      allocationCents: allocationCents.toString(),
    });
  }

  if (stepUpAboveCents !== null && stepUpAboveCents > perTxMaxCents) {
    throw invalidLimits("step_up_exceeds_per_tx", { perTxMaxCents: perTxMaxCents.toString() });
  }

  const expiresAt = parseExpiry(input.expiresAt);
  const notBefore = context.now;

  if (expiresAt.getTime() <= notBefore.getTime()) {
    throw new AppError(errorCodes.invalidExpiry, 400, { expiresAt: input.expiresAt });
  }

  const lifetimeMs = expiresAt.getTime() - notBefore.getTime();

  if (lifetimeMs > MAX_LEASH_LIFETIME_DAYS * 24 * 60 * 60 * 1000) {
    throw new AppError(errorCodes.expiryTooLong, 400, {
      expiresAt: input.expiresAt,
      maxDays: MAX_LEASH_LIFETIME_DAYS,
    });
  }

  const allowedPayees = resolveAllowedPayees(
    input.allowedPayees,
    input.allowedActions,
    context.verifiedPayees,
  );

  return {
    allocationCents,
    perTxMaxCents,
    dailyMaxCents,
    maxTxPerHour: input.limits.maxTxPerHour,
    stepUpAboveCents,
    notBefore,
    expiresAt,
    allowedPayees,
  };
}

/** Top-up amount must be positive and no larger than the kitty has available. */
export function validateTopupAmount(amount: string, kittyAvailableCents: bigint): bigint {
  const amountCents = parseMoney(amount);

  if (amountCents <= 0n) {
    throw new AppError(errorCodes.badRequest, 400, { reason: "top_up_amount_must_be_positive" });
  }

  if (amountCents > kittyAvailableCents) {
    throw new AppError(errorCodes.allocationExceedsKittyAvailable, 409, {
      amountCents: amountCents.toString(),
      kittyAvailableCents: kittyAvailableCents.toString(),
    });
  }

  return amountCents;
}

/** Throws `INVALID_STATE_TRANSITION` when `current` cannot take `transition`. */
export function assertLeashTransition(current: LeashStatus, transition: LeashTransition): void {
  if (!ALLOWED_FROM[transition].includes(current)) {
    throw new AppError(errorCodes.invalidStateTransition, 409, { current, transition });
  }
}
