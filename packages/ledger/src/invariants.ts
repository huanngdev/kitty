/**
 * Ledger invariants I1–I4 of docs/05-leash-spec.md §8.
 *
 * `checkInvariants` is a pure function over the whole ledger (a list of
 * transactions in posting order) and returns **all** violations it finds, so
 * the gateway can log them, and tests can assert the exact set. It never
 * throws: the throwing guard lives in `assertSingleMoneyMovement`.
 */

import {
  accountKey,
  isInternal,
  isKnownAccountKey,
  leashAvailable,
  leashHeld,
  parseAccountKey,
} from "./accounts";
import { balances } from "./balances";
import { kittyIdOfTxn, ledgerLines, leashIdOfTxn, txnAmount, type LedgerTxn } from "./entries";
import { formatMoney } from "./money";

/** Violation codes of {@link checkInvariants}. */
export type InvariantCode =
  | "I1_UNBALANCED_LEDGER"
  | "I1_KITTY_MISMATCH"
  | "I2_NEGATIVE_BUCKET"
  | "I3_TREE_OVER_ALLOCATION"
  | "I4_MULTIPLE_MONEY_MOVEMENTS"
  | "UNKNOWN_ACCOUNT"
  | "UNATTRIBUTED_KITTY";

/**
 * One broken invariant. Codes starting with `I<n>` are the enforced invariants;
 * `UNKNOWN_ACCOUNT` / `UNATTRIBUTED_KITTY` mean the ledger itself is not
 * interpretable (bad account key, leash not traceable to a kitty).
 */
export interface InvariantViolation {
  readonly code: InvariantCode;
  readonly message: string;
  /** Transaction that broke the invariant, when there is one. */
  readonly txnId?: string;
  /** Offending account key, for bucket-level violations. */
  readonly account?: string;
  readonly kittyId?: string;
  readonly leashId?: string;
  readonly intentId?: string;
  /** Expected value, for comparison violations. */
  readonly expectedCents?: bigint;
  /** Actual value, for comparison violations. */
  readonly actualCents?: bigint;
  /** Number of movements, for invariant I4. */
  readonly count?: number;
}

/**
 * Extra data `checkInvariants` cannot derive from the ledger alone.
 */
export interface LedgerInvariantOptions {
  /** Child leash id → parent leash id. Leashes absent from the map are roots. */
  readonly leashParentOf?: ReadonlyMap<string, string>;
  /**
   * Leash id → kitty id. Fills the gap when a leash is known before its
   * allocation transaction is posted.
   */
  readonly kittyOfLeash?: ReadonlyMap<string, string>;
}

interface KittyFlow {
  contributionCents: bigint;
  payoutCents: bigint;
  refundCents: bigint;
}

/**
 * Checks every invariant of §8 against `txns` (in posting order) and returns
 * the violations found:
 *
 * - **I1** the whole ledger sums to zero, and per kitty
 *   `Σ internal buckets === Σ contributions − Σ settled payouts − Σ refunds`.
 * - **I2** no internal bucket is negative after any transaction in order (only
 *   the first transaction that breaks it is reported).
 * - **I3** for every leash tree, `Σ (available + held + spent) ≤ Σ allocated`
 *   (root allocation plus top-ups; sub-leashes are fed by their parent).
 * - **I4** at most one `settlePayout`/`refundMember` per intent id.
 */
export function checkInvariants(
  txns: readonly LedgerTxn[],
  options: LedgerInvariantOptions = {},
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const lines = ledgerLines(txns);
  const allBalances = balances(lines);

  checkLedgerSumsToZero(allBalances, violations);

  const kittyOfLeash = resolveKittyIds(txns, options);
  checkKittyBalances(txns, allBalances, kittyOfLeash, violations);
  checkNonNegativeBuckets(txns, violations);
  checkLeashTrees(
    txns,
    allBalances,
    options.leashParentOf ?? new Map<string, string>(),
    violations,
  );
  checkSingleMoneyMovements(txns, violations);

  return violations;
}

/** I1, global: every line of every transaction cancels out. */
function checkLedgerSumsToZero(
  allBalances: ReadonlyMap<string, bigint>,
  violations: InvariantViolation[],
): void {
  let total = 0n;

  for (const balance of allBalances.values()) {
    total += balance;
  }

  if (total !== 0n) {
    violations.push({
      code: "I1_UNBALANCED_LEDGER",
      message: `all ledger buckets sum to ${formatMoney(total)} instead of zero`,
      actualCents: total,
    });
  }
}

/**
 * Kitty id of every leash: from `kitty:available → leash:available` allocations,
 * then propagated down the `leashParentOf` tree (a sub-leash belongs to the
 * same kitty as its parent).
 */
function resolveKittyIds(
  txns: readonly LedgerTxn[],
  options: LedgerInvariantOptions,
): Map<string, string> {
  const known = new Map<string, string>(options.kittyOfLeash ?? []);

  for (const ledgerTxn of txns) {
    if (ledgerTxn.kind !== "allocateLeash") {
      continue;
    }

    const kittyId = kittyIdOfTxn(ledgerTxn);
    const leashId = leashIdOfTxn(ledgerTxn);

    if (kittyId === undefined || leashId === undefined) {
      continue;
    }

    known.set(leashId, kittyId);
  }

  propagateKittyIds(known, options.leashParentOf ?? new Map<string, string>());

  return known;
}

function propagateKittyIds(
  known: Map<string, string>,
  parentOf: ReadonlyMap<string, string>,
): void {
  const childrenOf = new Map<string, string[]>();

  for (const [child, parent] of parentOf) {
    const siblings = childrenOf.get(parent);

    if (siblings === undefined) {
      childrenOf.set(parent, [child]);
    } else {
      siblings.push(child);
    }
  }

  // `queue` grows while it is iterated, which walks the whole forest without
  // needing an index or a possibly-undefined peek.
  const queue: Array<readonly [string, string]> = [...known];

  for (const [leashId, kittyId] of queue) {
    for (const child of childrenOf.get(leashId) ?? []) {
      if (!known.has(child)) {
        known.set(child, kittyId);
        queue.push([child, kittyId]);
      }
    }
  }
}

function kittyIdOfTxnResolved(
  ledgerTxn: LedgerTxn,
  kittyOfLeash: ReadonlyMap<string, string>,
): string | undefined {
  const directKittyId = kittyIdOfTxn(ledgerTxn);

  if (directKittyId !== undefined) {
    return directKittyId;
  }

  const leashId = leashIdOfTxn(ledgerTxn);

  if (leashId === undefined) {
    return undefined;
  }

  return kittyOfLeash.get(leashId);
}

function getFlow(flows: Map<string, KittyFlow>, kittyId: string): KittyFlow {
  const existing = flows.get(kittyId);

  if (existing !== undefined) {
    return existing;
  }

  const created: KittyFlow = { contributionCents: 0n, payoutCents: 0n, refundCents: 0n };
  flows.set(kittyId, created);

  return created;
}

/**
 * I1, per kitty: internal buckets equal
 * `contributions − settled payouts − refunds`. External accounts carry no kitty
 * id, so the flows are read from the transaction kinds and the internal side
 * from the balances; a mismatch means money moved in a way §8 does not allow.
 */
function checkKittyBalances(
  txns: readonly LedgerTxn[],
  allBalances: ReadonlyMap<string, bigint>,
  kittyOfLeash: ReadonlyMap<string, string>,
  violations: InvariantViolation[],
): void {
  const internalByKitty = new Map<string, bigint>();
  const unattributed: string[] = [];

  for (const [account, amount] of allBalances) {
    if (!isKnownAccountKey(account)) {
      violations.push({
        code: "UNKNOWN_ACCOUNT",
        account,
        message: `${account} is not a known bucket, so it cannot be reconciled`,
      });
      continue;
    }

    const ref = parseAccountKey(account);

    if (!isInternal(ref)) {
      continue;
    }

    const kittyId = ref.kind === "kitty" ? ref.kittyId : kittyOfLeash.get(ref.leashId);

    if (kittyId === undefined) {
      unattributed.push(account);
      continue;
    }

    internalByKitty.set(kittyId, (internalByKitty.get(kittyId) ?? 0n) + amount);
  }

  for (const account of unattributed) {
    violations.push({
      code: "UNATTRIBUTED_KITTY",
      account,
      message: `internal bucket ${account} cannot be traced to a kitty; pass kittyOfLeash`,
    });
  }

  const flowByKitty = new Map<string, KittyFlow>();

  for (const ledgerTxn of txns) {
    const kittyId = kittyIdOfTxnResolved(ledgerTxn, kittyOfLeash);

    if (kittyId === undefined) {
      continue;
    }

    const flow = getFlow(flowByKitty, kittyId);

    if (ledgerTxn.kind === "contribution") {
      flow.contributionCents += txnAmount(ledgerTxn);
    } else if (ledgerTxn.kind === "settlePayout") {
      flow.payoutCents += txnAmount(ledgerTxn);
    } else if (ledgerTxn.kind === "refundMember") {
      flow.refundCents += txnAmount(ledgerTxn);
    }
  }

  const kittyIds = new Set([...internalByKitty.keys(), ...flowByKitty.keys()]);

  for (const kittyId of kittyIds) {
    const actual = internalByKitty.get(kittyId) ?? 0n;
    const flow = flowByKitty.get(kittyId) ?? {
      contributionCents: 0n,
      payoutCents: 0n,
      refundCents: 0n,
    };
    const expected = flow.contributionCents - flow.payoutCents - flow.refundCents;

    if (actual !== expected) {
      violations.push({
        code: "I1_KITTY_MISMATCH",
        kittyId,
        expectedCents: expected,
        actualCents: actual,
        message: `kitty ${kittyId} holds ${formatMoney(actual)} internally but contributions − payouts − refunds is ${formatMoney(expected)}`,
      });
    }
  }
}

function isInternalAccountKey(account: string): boolean {
  return isKnownAccountKey(account) && isInternal(parseAccountKey(account));
}

/**
 * I2: replay the transactions in order and report the first one that leaves an
 * internal bucket negative, together with every bucket that went negative at
 * that point. A healthy ledger never spends money it does not hold.
 */
function checkNonNegativeBuckets(
  txns: readonly LedgerTxn[],
  violations: InvariantViolation[],
): void {
  const running = new Map<string, bigint>();

  for (const ledgerTxn of txns) {
    for (const ledgerLine of ledgerTxn.lines) {
      running.set(
        ledgerLine.account,
        (running.get(ledgerLine.account) ?? 0n) + ledgerLine.amountCents,
      );
    }

    const negatives: string[] = [];

    for (const [account, amount] of running) {
      if (amount < 0n && isInternalAccountKey(account)) {
        negatives.push(account);
      }
    }

    if (negatives.length === 0) {
      continue;
    }

    for (const account of negatives) {
      violations.push({
        code: "I2_NEGATIVE_BUCKET",
        account,
        txnId: ledgerTxn.txnId,
        actualCents: running.get(account) ?? 0n,
        message: `internal bucket ${account} went negative after txn ${ledgerTxn.txnId}`,
      });
    }

    break;
  }
}

function collectTree(
  leashId: string,
  childrenOf: ReadonlyMap<string, readonly string[]>,
  out: string[],
): void {
  out.push(leashId);

  for (const child of childrenOf.get(leashId) ?? []) {
    collectTree(child, childrenOf, out);
  }
}

/**
 * I3: money can only enter a leash tree through `allocateLeash` (root allocation
 * or top-up) and only move inside it through `delegate`; whatever the tree still
 * holds (`available + held`) plus what it already paid out can never exceed what
 * was allocated into it.
 */
function checkLeashTrees(
  txns: readonly LedgerTxn[],
  allBalances: ReadonlyMap<string, bigint>,
  parentOf: ReadonlyMap<string, string>,
  violations: InvariantViolation[],
): void {
  const childrenOf = new Map<string, string[]>();
  const leashIds = new Set<string>();

  for (const [child, parent] of parentOf) {
    const siblings = childrenOf.get(parent);

    if (siblings === undefined) {
      childrenOf.set(parent, [child]);
    } else {
      siblings.push(child);
    }

    leashIds.add(child);
  }

  for (const account of allBalances.keys()) {
    if (isKnownAccountKey(account)) {
      const ref = parseAccountKey(account);

      if (ref.kind === "leash") {
        leashIds.add(ref.leashId);
      }
    }
  }

  const allocatedByLeash = new Map<string, bigint>();
  const spentByLeash = new Map<string, bigint>();

  for (const ledgerTxn of txns) {
    const leashId = leashIdOfTxn(ledgerTxn);

    if (leashId === undefined) {
      continue;
    }

    if (ledgerTxn.kind === "allocateLeash") {
      allocatedByLeash.set(leashId, (allocatedByLeash.get(leashId) ?? 0n) + txnAmount(ledgerTxn));
    }

    if (ledgerTxn.kind === "settlePayout") {
      spentByLeash.set(leashId, (spentByLeash.get(leashId) ?? 0n) + txnAmount(ledgerTxn));
    }
  }

  for (const leashId of leashIds) {
    if (parentOf.get(leashId) !== undefined) {
      continue;
    }

    const tree: string[] = [];
    collectTree(leashId, childrenOf, tree);

    let heldCents = 0n;
    let allocatedCents = 0n;

    for (const member of tree) {
      heldCents += allBalances.get(accountKey(leashAvailable(member))) ?? 0n;
      heldCents += allBalances.get(accountKey(leashHeld(member))) ?? 0n;
      heldCents += spentByLeash.get(member) ?? 0n;
      allocatedCents += allocatedByLeash.get(member) ?? 0n;
    }

    if (heldCents > allocatedCents) {
      violations.push({
        code: "I3_TREE_OVER_ALLOCATION",
        leashId,
        expectedCents: allocatedCents,
        actualCents: heldCents,
        message: `leash tree ${leashId} holds ${formatMoney(heldCents)} but only ${formatMoney(allocatedCents)} was allocated into it`,
      });
    }
  }
}

function countMoneyMovements(txns: readonly LedgerTxn[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const ledgerTxn of txns) {
    if (ledgerTxn.intentId === undefined) {
      continue;
    }

    if (ledgerTxn.kind !== "settlePayout" && ledgerTxn.kind !== "refundMember") {
      continue;
    }

    counts.set(ledgerTxn.intentId, (counts.get(ledgerTxn.intentId) ?? 0) + 1);
  }

  return counts;
}

/** I4: an intent may pay out at most once (§7, §10 double-spend protection). */
function checkSingleMoneyMovements(
  txns: readonly LedgerTxn[],
  violations: InvariantViolation[],
): void {
  for (const [intentId, count] of countMoneyMovements(txns)) {
    if (count > 1) {
      violations.push({
        code: "I4_MULTIPLE_MONEY_MOVEMENTS",
        intentId,
        count,
        message: `intent ${intentId} produced ${count} money movements, but at most one is allowed`,
      });
    }
  }
}

/** Thrown by {@link assertSingleMoneyMovement} when an intent paid out twice. */
export class MultipleMoneyMovementsError extends Error {
  readonly code = "I4_MULTIPLE_MONEY_MOVEMENTS";
  readonly intentId: string;
  readonly count: number;

  constructor(intentId: string, count: number) {
    super(`intent ${intentId} produced ${count} money movements, but at most one is allowed`);
    this.name = "MultipleMoneyMovementsError";
    this.intentId = intentId;
    this.count = count;
  }
}

/**
 * I4 as a guard for the payment path: throws
 * {@link MultipleMoneyMovementsError} when `intentId` already settled or
 * refunded more than once.
 */
export function assertSingleMoneyMovement(intentId: string, txns: readonly LedgerTxn[]): void {
  const count = countMoneyMovements(txns).get(intentId) ?? 0;

  if (count > 1) {
    throw new MultipleMoneyMovementsError(intentId, count);
  }
}
