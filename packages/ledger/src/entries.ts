/**
 * Ledger transactions of docs/05-leash-spec.md §8.
 *
 * A transaction ("bút toán") moves money from a debit account (negative line)
 * to a credit account (positive line); the lines of a balanced transaction sum
 * to zero. Every {@link LedgerTxn} produced here has exactly two lines, because
 * every event in §8 is a single movement between two buckets.
 */

import {
  type AccountRef,
  accountKey,
  externalMember,
  externalPayee,
  isKnownAccountKey,
  kittyAvailable,
  leashAvailable,
  leashHeld,
  parseAccountKey,
} from "./accounts";

/** Event kinds of §8 (the "Bút toán" table). */
export type TxnKind =
  | "contribution"
  | "allocateLeash"
  | "delegate"
  | "reserve"
  | "settlePayout"
  | "release"
  | "revokeLeash"
  | "refundMember";

/** One leg of a transaction: signed integer cents on a canonical account key. */
export interface LedgerLine {
  readonly account: string;
  readonly amountCents: bigint;
}

/** A posted transaction. `Σ lines.amountCents` must be `0n`. */
export interface LedgerTxn {
  readonly txnId: string;
  readonly kind: TxnKind;
  readonly lines: readonly LedgerLine[];
  /**
   * Spend intent this movement belongs to (`reserve`, `release`,
   * `settlePayout`, `refundMember`). Invariant I4 uses it to guarantee at most
   * one PayPal money movement per intent.
   */
  readonly intentId?: string;
}

/** Error codes of the transaction builders. */
export type TxnArgErrorCode = "NEGATIVE_AMOUNT_ARG" | "INVALID_ACCOUNT_ARG";

/**
 * Thrown by a builder when an argument is unusable: a non-positive amount
 * (`NEGATIVE_AMOUNT_ARG`) or an account that cannot take part in that event
 * (`INVALID_ACCOUNT_ARG`).
 */
export class TxnArgError extends Error {
  readonly code: TxnArgErrorCode;
  readonly field: string;

  constructor(code: TxnArgErrorCode, field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "TxnArgError";
    this.code = code;
    this.field = field;
  }
}

/** Result of {@link validateTxn} when the transaction is structurally sound. */
export interface TxnValidationValid {
  readonly ok: true;
}

/** Reason codes of {@link validateTxn}. */
export type TxnInvalidCode =
  "EMPTY" | "TOO_FEW_LINES" | "UNKNOWN_ACCOUNT" | "ZERO_LINE" | "DUPLICATE_ACCOUNT" | "UNBALANCED";

/** Result of {@link validateTxn} when the transaction is malformed. */
export interface TxnValidationInvalid {
  readonly ok: false;
  readonly code: TxnInvalidCode;
  readonly message: string;
  /** Index of the offending line, when the failure is about one line. */
  readonly lineIndex?: number;
  /** Offending account, when the failure is about one line. */
  readonly account?: string;
  /** Sum of the lines, when the transaction is unbalanced. */
  readonly sumCents?: bigint;
}

/** Discriminated result of {@link validateTxn}. */
export type TxnValidationResult = TxnValidationValid | TxnValidationInvalid;

function assertPositiveAmount(amountCents: bigint, event: TxnKind): bigint {
  if (typeof amountCents !== "bigint" || amountCents <= 0n) {
    throw new TxnArgError(
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
      `${event} requires a positive number of cents, received ${String(amountCents)}`,
    );
  }

  return amountCents;
}

function line(account: AccountRef, amountCents: bigint): LedgerLine {
  return { account: accountKey(account), amountCents };
}

function txn(
  txnId: string,
  kind: TxnKind,
  lines: readonly LedgerLine[],
  intentId?: string,
): LedgerTxn {
  if (intentId === undefined) {
    return { txnId, kind, lines };
  }

  return { txnId, kind, lines, intentId };
}

/** Arguments of {@link contribution}. */
export interface ContributionArgs {
  readonly txnId: string;
  readonly kittyId: string;
  readonly memberId: string;
  readonly amountCents: bigint;
}

/**
 * §8 "Member trả invoice / organizer nạp":
 * `external:member:{id}` → `kitty:available`.
 */
export function contribution(args: ContributionArgs): LedgerTxn {
  const amountCents = assertPositiveAmount(args.amountCents, "contribution");

  return txn(args.txnId, "contribution", [
    line(externalMember(args.memberId), -amountCents),
    line(kittyAvailable(args.kittyId), amountCents),
  ]);
}

/** Arguments of {@link allocateLeash}. */
export interface AllocateLeashArgs {
  readonly txnId: string;
  readonly kittyId: string;
  readonly leashId: string;
  readonly amountCents: bigint;
}

/**
 * §8 "Allocate leash gốc / top-up" — allocating or topping up a leash:
 * `kitty:available` → `leash:{id}:available`.
 */
export function allocateLeash(args: AllocateLeashArgs): LedgerTxn {
  const amountCents = assertPositiveAmount(args.amountCents, "allocateLeash");

  return txn(args.txnId, "allocateLeash", [
    line(kittyAvailable(args.kittyId), -amountCents),
    line(leashAvailable(args.leashId), amountCents),
  ]);
}

/** Arguments of {@link delegate}. */
export interface DelegateArgs {
  readonly txnId: string;
  readonly parentLeashId: string;
  readonly childLeashId: string;
  readonly amountCents: bigint;
}

/**
 * §8 "Delegate sub-leash" and §9 — the child allocation is cut out of the
 * parent: `leash:{parent}:available` → `leash:{child}:available`.
 */
export function delegate(args: DelegateArgs): LedgerTxn {
  const amountCents = assertPositiveAmount(args.amountCents, "delegate");

  if (args.parentLeashId === args.childLeashId) {
    throw new TxnArgError(
      "INVALID_ACCOUNT_ARG",
      "childLeashId",
      "delegate must move money to a different leash than its parent",
    );
  }

  return txn(args.txnId, "delegate", [
    line(leashAvailable(args.parentLeashId), -amountCents),
    line(leashAvailable(args.childLeashId), amountCents),
  ]);
}

/** Arguments of {@link reserve}. */
export interface ReserveArgs {
  readonly txnId: string;
  readonly leashId: string;
  readonly amountCents: bigint;
  readonly intentId?: string;
}

/**
 * §7 "Reserve intent" — money is held while the intent waits for a PayPal
 * result: `leash:{id}:available` → `leash:{id}:held`.
 */
export function reserve(args: ReserveArgs): LedgerTxn {
  const amountCents = assertPositiveAmount(args.amountCents, "reserve");

  return txn(
    args.txnId,
    "reserve",
    [line(leashAvailable(args.leashId), -amountCents), line(leashHeld(args.leashId), amountCents)],
    args.intentId,
  );
}

/** Arguments of {@link settlePayout}. */
export interface SettlePayoutArgs {
  readonly txnId: string;
  readonly leashId: string;
  readonly payeeEmail: string;
  readonly amountCents: bigint;
  readonly intentId?: string;
}

/**
 * §8 "Settled payout" — PayPal confirms the money left for the payee:
 * `leash:{id}:held` → `external:payee:{email}`.
 */
export function settlePayout(args: SettlePayoutArgs): LedgerTxn {
  const amountCents = assertPositiveAmount(args.amountCents, "settlePayout");

  return txn(
    args.txnId,
    "settlePayout",
    [
      line(leashHeld(args.leashId), -amountCents),
      line(externalPayee(args.payeeEmail), amountCents),
    ],
    args.intentId,
  );
}

/** Arguments of {@link release}. */
export interface ReleaseArgs {
  readonly txnId: string;
  readonly leashId: string;
  readonly amountCents: bigint;
  readonly intentId?: string;
}

/**
 * §8 "Failed / released / rejected" — the hold is given back to the leash:
 * `leash:{id}:held` → `leash:{id}:available`.
 */
export function release(args: ReleaseArgs): LedgerTxn {
  const amountCents = assertPositiveAmount(args.amountCents, "release");

  return txn(
    args.txnId,
    "release",
    [line(leashHeld(args.leashId), -amountCents), line(leashAvailable(args.leashId), amountCents)],
    args.intentId,
  );
}

/** Arguments of {@link revokeLeash}. */
export interface RevokeLeashArgs {
  readonly txnId: string;
  readonly leashId: string;
  /** Where the remaining money goes back to: `kitty:available` or a parent `leash:…:available`. */
  readonly returnTo: AccountRef;
  readonly amountCents: bigint;
}

function assertReturnTarget(returnTo: AccountRef, revokedLeashId: string): void {
  if (returnTo.kind === "kitty") {
    return;
  }

  if (returnTo.kind === "leash" && returnTo.bucket === "available") {
    if (returnTo.leashId === revokedLeashId) {
      throw new TxnArgError(
        "INVALID_ACCOUNT_ARG",
        "returnTo",
        "revokeLeash must return money to the leash source, not to itself",
      );
    }

    return;
  }

  throw new TxnArgError(
    "INVALID_ACCOUNT_ARG",
    "returnTo",
    "revokeLeash must return money to kitty:available or another leash available bucket",
  );
}

/**
 * §8 "Revoke/expire leash" and §11 — the unspent allocation of a revoked leash
 * flows back to its source: `leash:{id}:available` → `kitty:available` or
 * `leash:{parent}:available`. Held money returns when its intent ends
 * ({@link release} then this transaction).
 */
export function revokeLeash(args: RevokeLeashArgs): LedgerTxn {
  const amountCents = assertPositiveAmount(args.amountCents, "revokeLeash");
  assertReturnTarget(args.returnTo, args.leashId);

  return txn(args.txnId, "revokeLeash", [
    line(leashAvailable(args.leashId), -amountCents),
    line(args.returnTo, amountCents),
  ]);
}

/** Arguments of {@link refundMember}. */
export interface RefundMemberArgs {
  readonly txnId: string;
  readonly memberId: string;
  /** Source of the refund: `kitty:available` or the `held` bucket of the Treasurer leash. */
  readonly from: AccountRef;
  readonly amountCents: bigint;
}

function assertRefundSource(from: AccountRef): void {
  if (from.kind === "kitty") {
    return;
  }

  if (from.kind === "leash" && from.bucket === "held") {
    return;
  }

  throw new TxnArgError(
    "INVALID_ACCOUNT_ARG",
    "from",
    "refundMember must be funded from kitty:available or a leash held bucket",
  );
}

/**
 * §8 "Refund member" — `kitty:available` (or the held bucket of the Treasurer
 * leash) → `external:member:{id}`.
 */
export function refundMember(args: RefundMemberArgs): LedgerTxn {
  const amountCents = assertPositiveAmount(args.amountCents, "refundMember");
  assertRefundSource(args.from);

  return txn(args.txnId, "refundMember", [
    line(args.from, -amountCents),
    line(externalMember(args.memberId), amountCents),
  ]);
}

/**
 * Validates the structure of a transaction: at least two lines, no zero line,
 * known account keys, no repeated account within the same transaction, and
 * `Σ lines === 0`.
 */
export function validateTxn(txnToValidate: LedgerTxn): TxnValidationResult {
  const lines = txnToValidate.lines;

  if (lines.length === 0) {
    return {
      ok: false,
      code: "EMPTY",
      message: `${txnToValidate.txnId} has no ledger lines`,
    };
  }

  if (lines.length < 2) {
    return {
      ok: false,
      code: "TOO_FEW_LINES",
      message: `${txnToValidate.txnId} needs at least two lines, received ${lines.length}`,
      lineIndex: 0,
    };
  }

  const seenAccounts = new Set<string>();
  let sumCents = 0n;

  for (const [index, ledgerLine] of lines.entries()) {
    if (!isKnownAccountKey(ledgerLine.account)) {
      return {
        ok: false,
        code: "UNKNOWN_ACCOUNT",
        message: `${ledgerLine.account} is not a known account key`,
        lineIndex: index,
        account: ledgerLine.account,
      };
    }

    if (ledgerLine.amountCents === 0n) {
      return {
        ok: false,
        code: "ZERO_LINE",
        message: `${txnToValidate.txnId} has a zero-amount line for ${ledgerLine.account}`,
        lineIndex: index,
        account: ledgerLine.account,
      };
    }

    if (seenAccounts.has(ledgerLine.account)) {
      return {
        ok: false,
        code: "DUPLICATE_ACCOUNT",
        message: `${ledgerLine.account} appears twice in ${txnToValidate.txnId}`,
        lineIndex: index,
        account: ledgerLine.account,
      };
    }

    seenAccounts.add(ledgerLine.account);
    sumCents += ledgerLine.amountCents;
  }

  if (sumCents !== 0n) {
    return {
      ok: false,
      code: "UNBALANCED",
      message: `${txnToValidate.txnId} lines sum to ${sumCents.toString()} cents instead of zero`,
      sumCents,
    };
  }

  return { ok: true };
}

/**
 * Flattens transactions into the stream of ledger lines that
 * `balanceOf`/`balances` read.
 */
export function ledgerLines(txns: readonly LedgerTxn[]): LedgerLine[] {
  const lines: LedgerLine[] = [];

  for (const ledgerTxn of txns) {
    for (const ledgerLine of ledgerTxn.lines) {
      lines.push(ledgerLine);
    }
  }

  return lines;
}

/**
 * The positive amount of a transaction, that is the money it moves. Used by the
 * invariants to size contributions, payouts and allocations.
 */
export function txnAmount(txnToMeasure: LedgerTxn): bigint {
  let total = 0n;

  for (const ledgerLine of txnToMeasure.lines) {
    if (ledgerLine.amountCents > 0n) {
      total += ledgerLine.amountCents;
    }
  }

  return total;
}

/** The leash referenced by `txn`, when it references exactly one. */
export function leashIdOfTxn(txnToInspect: LedgerTxn): string | undefined {
  for (const ledgerLine of txnToInspect.lines) {
    if (!isKnownAccountKey(ledgerLine.account)) {
      continue;
    }

    const ref = parseAccountKey(ledgerLine.account);

    if (ref.kind === "leash") {
      return ref.leashId;
    }
  }

  return undefined;
}

/** The kitty whose `kitty:*` bucket is referenced by `txn`, when any. */
export function kittyIdOfTxn(txnToInspect: LedgerTxn): string | undefined {
  for (const ledgerLine of txnToInspect.lines) {
    if (!isKnownAccountKey(ledgerLine.account)) {
      continue;
    }

    const ref = parseAccountKey(ledgerLine.account);

    if (ref.kind === "kitty") {
      return ref.kittyId;
    }
  }

  return undefined;
}
