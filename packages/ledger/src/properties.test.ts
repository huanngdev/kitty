import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { accountKey, isKnownAccountKey, kittyAvailable, leashAvailable } from "./accounts";
import { balanceOf, balances, leashBalance } from "./balances";
import {
  allocateLeash,
  contribution,
  delegate,
  ledgerLines,
  refundMember,
  release,
  reserve,
  settlePayout,
  type LedgerLine,
  type LedgerTxn,
} from "./entries";
import { MoneyFormatError, formatMoney, parseMoney } from "./money";
import { assertSingleMoneyMovement, checkInvariants } from "./invariants";

const KITTY_ID = "kty_1";
const PAYEE = "vendor@example.com";
const AMOUNTS: readonly bigint[] = [1n, 2n, 3n, 5n, 10n, 100n];
const LEASH_IDS: readonly string[] = ["lsh_1", "lsh_2", "lsh_3", "lsh_4"];
const MEMBER_IDS: readonly string[] = ["mem_1", "mem_2"];

/** `lsh_2`/`lsh_3` are children of `lsh_1`; `lsh_4` is a child of `lsh_2` (§9, max depth 2). */
const LEASH_PARENT_OF = new Map<string, string>([
  ["lsh_2", "lsh_1"],
  ["lsh_3", "lsh_1"],
  ["lsh_4", "lsh_2"],
]);

/** Allowed `delegate` movements: `[parentLeashId, childLeashId]`. */
const DELEGATION_EDGES: ReadonlyArray<readonly [string, string]> = [
  ["lsh_1", "lsh_2"],
  ["lsh_1", "lsh_3"],
  ["lsh_2", "lsh_4"],
];

/** Canonical money wire strings: no leading zeros, exactly two decimals. */
const canonicalMoneyArbitrary = fc
  .tuple(fc.nat({ max: 1_000_000 }), fc.nat({ max: 99 }))
  .map(([whole, cents]) => `${whole.toString()}.${cents.toString().padStart(2, "0")}`);

const accountKeyArbitrary = fc.constantFrom(
  accountKey(kittyAvailable(KITTY_ID)),
  accountKey(leashAvailable("lsh_1")),
  accountKey(leashAvailable("lsh_2")),
  "external:member:mem_1",
  "external:payee:vendor@example.com",
);

const lineArbitrary: fc.Arbitrary<LedgerLine> = fc.record({
  account: accountKeyArbitrary,
  amountCents: fc.bigInt({ min: -100_000n, max: 100_000n }),
});

const indexArbitrary = (max: number): fc.Arbitrary<number> => fc.nat({ max });

type Operation =
  | { readonly type: "contribute"; readonly memberIndex: number; readonly amountIndex: number }
  | { readonly type: "allocate"; readonly leashIndex: number; readonly amountIndex: number }
  | { readonly type: "delegate"; readonly edgeIndex: number; readonly amountIndex: number }
  | { readonly type: "reserve"; readonly leashIndex: number; readonly amountIndex: number }
  | { readonly type: "refund"; readonly memberIndex: number; readonly amountIndex: number }
  | { readonly type: "settle"; readonly intentIndex: number }
  | { readonly type: "release"; readonly intentIndex: number };

const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    type: fc.constant("contribute" as const),
    memberIndex: indexArbitrary(MEMBER_IDS.length - 1),
    amountIndex: indexArbitrary(AMOUNTS.length - 1),
  }),
  fc.record({
    type: fc.constant("allocate" as const),
    leashIndex: indexArbitrary(LEASH_IDS.length - 1),
    amountIndex: indexArbitrary(AMOUNTS.length - 1),
  }),
  fc.record({
    type: fc.constant("delegate" as const),
    edgeIndex: indexArbitrary(DELEGATION_EDGES.length - 1),
    amountIndex: indexArbitrary(AMOUNTS.length - 1),
  }),
  fc.record({
    type: fc.constant("reserve" as const),
    leashIndex: indexArbitrary(LEASH_IDS.length - 1),
    amountIndex: indexArbitrary(AMOUNTS.length - 1),
  }),
  fc.record({
    type: fc.constant("refund" as const),
    memberIndex: indexArbitrary(MEMBER_IDS.length - 1),
    amountIndex: indexArbitrary(AMOUNTS.length - 1),
  }),
  fc.record({ type: fc.constant("settle" as const), intentIndex: indexArbitrary(4) }),
  fc.record({ type: fc.constant("release" as const), intentIndex: indexArbitrary(4) }),
);

interface OpenIntent {
  readonly intentId: string;
  readonly leashId: string;
  readonly amountCents: bigint;
}

/**
 * Plays a random sequence of §8 events, skipping any that the policy layer would
 * have refused (not enough available money), and returns the posted ledger plus
 * the expected balances.
 */
function playOperations(operations: readonly Operation[]): {
  txns: LedgerTxn[];
  kittyAvailableCents: bigint;
  leashAvailableCents: Map<string, bigint>;
  openIntents: OpenIntent[];
} {
  const txns: LedgerTxn[] = [];
  const leashAvailableCents = new Map<string, bigint>(LEASH_IDS.map((leashId) => [leashId, 0n]));
  const openIntents: OpenIntent[] = [];
  let kittyAvailableCents = 0n;
  let txnCounter = 0;
  let intentCounter = 0;

  for (const operation of operations) {
    const amountCents = "amountIndex" in operation ? (AMOUNTS[operation.amountIndex] ?? 1n) : 0n;

    if (operation.type === "contribute") {
      txnCounter += 1;
      txns.push(
        contribution({
          txnId: `txn_${txnCounter}`,
          kittyId: KITTY_ID,
          memberId: MEMBER_IDS[operation.memberIndex] ?? "mem_1",
          amountCents,
        }),
      );
      kittyAvailableCents += amountCents;
      continue;
    }

    if (operation.type === "allocate") {
      const leashId = LEASH_IDS[operation.leashIndex] ?? "lsh_1";

      if (kittyAvailableCents < amountCents) {
        continue;
      }

      txnCounter += 1;
      txns.push(
        allocateLeash({ txnId: `txn_${txnCounter}`, kittyId: KITTY_ID, leashId, amountCents }),
      );
      kittyAvailableCents -= amountCents;
      leashAvailableCents.set(leashId, (leashAvailableCents.get(leashId) ?? 0n) + amountCents);
      continue;
    }

    if (operation.type === "delegate") {
      const edge = DELEGATION_EDGES[operation.edgeIndex] ?? ["lsh_1", "lsh_2"];
      const parentLeashId = edge[0];
      const childLeashId = edge[1];

      if ((leashAvailableCents.get(parentLeashId) ?? 0n) < amountCents) {
        continue;
      }

      txnCounter += 1;
      txns.push(delegate({ txnId: `txn_${txnCounter}`, parentLeashId, childLeashId, amountCents }));
      leashAvailableCents.set(
        parentLeashId,
        (leashAvailableCents.get(parentLeashId) ?? 0n) - amountCents,
      );
      leashAvailableCents.set(
        childLeashId,
        (leashAvailableCents.get(childLeashId) ?? 0n) + amountCents,
      );
      continue;
    }

    if (operation.type === "reserve") {
      const leashId = LEASH_IDS[operation.leashIndex] ?? "lsh_1";

      if ((leashAvailableCents.get(leashId) ?? 0n) < amountCents) {
        continue;
      }

      txnCounter += 1;
      intentCounter += 1;
      const intentId = `int_${intentCounter}`;
      txns.push(reserve({ txnId: `txn_${txnCounter}`, leashId, amountCents, intentId }));
      openIntents.push({ intentId, leashId, amountCents });
      leashAvailableCents.set(leashId, (leashAvailableCents.get(leashId) ?? 0n) - amountCents);
      continue;
    }

    if (operation.type === "refund") {
      if (kittyAvailableCents < amountCents) {
        continue;
      }

      txnCounter += 1;
      txns.push(
        refundMember({
          txnId: `txn_${txnCounter}`,
          memberId: MEMBER_IDS[operation.memberIndex] ?? "mem_1",
          from: kittyAvailable(KITTY_ID),
          amountCents,
        }),
      );
      kittyAvailableCents -= amountCents;
      continue;
    }

    const intent = openIntents[operation.intentIndex];

    if (intent === undefined) {
      continue;
    }

    txnCounter += 1;
    openIntents.splice(operation.intentIndex, 1);

    if (operation.type === "settle") {
      txns.push(
        settlePayout({
          txnId: `txn_${txnCounter}`,
          leashId: intent.leashId,
          payeeEmail: PAYEE,
          amountCents: intent.amountCents,
          intentId: intent.intentId,
        }),
      );
      continue;
    }

    txns.push(
      release({
        txnId: `txn_${txnCounter}`,
        leashId: intent.leashId,
        amountCents: intent.amountCents,
        intentId: intent.intentId,
      }),
    );
    leashAvailableCents.set(
      intent.leashId,
      (leashAvailableCents.get(intent.leashId) ?? 0n) + intent.amountCents,
    );
  }

  return { txns, kittyAvailableCents, leashAvailableCents, openIntents };
}

describe("money round-trips", () => {
  test("formatMoney(parseMoney(value)) === value for canonical wire strings", () => {
    fc.assert(
      fc.property(canonicalMoneyArbitrary, (value) => {
        expect(formatMoney(parseMoney(value))).toBe(value);
      }),
    );
  });

  test("parseMoney(formatMoney(cents)) === cents for non-negative cents", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 24n }), (cents) => {
        expect(parseMoney(formatMoney(cents))).toBe(cents);
      }),
    );
  });

  test("parseMoney accepts exactly the wire format", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        if (/^\d+\.\d{2}$/.test(value)) {
          expect(parseMoney(value)).toBeGreaterThanOrEqual(0n);
          return;
        }

        expect(() => parseMoney(value)).toThrow(MoneyFormatError);
      }),
    );
  });
});

describe("balanceOf", () => {
  test("is additive over concatenated line streams", () => {
    fc.assert(
      fc.property(
        fc.array(lineArbitrary),
        fc.array(lineArbitrary),
        accountKeyArbitrary,
        (first, second, account) => {
          expect(balanceOf([...first, ...second], account)).toBe(
            balanceOf(first, account) + balanceOf(second, account),
          );
        },
      ),
    );
  });

  test("agrees with balances() for every account of the stream", () => {
    fc.assert(
      fc.property(fc.array(lineArbitrary), (lines) => {
        const totals = balances(lines);

        for (const [account, total] of totals) {
          expect(balanceOf(lines, account)).toBe(total);
        }

        for (const line of lines) {
          expect(isKnownAccountKey(line.account)).toBe(true);
        }
      }),
    );
  });
});

describe("random event sequences", () => {
  test("keep I1, I2, I3 and the simulated balances", () => {
    fc.assert(
      fc.property(fc.array(operationArbitrary, { maxLength: 24 }), (operations) => {
        const { txns, leashAvailableCents, openIntents } = playOperations(operations);
        const lines = ledgerLines(txns);

        expect(checkInvariants(txns, { leashParentOf: LEASH_PARENT_OF })).toEqual([]);

        const heldByLeash = new Map<string, bigint>();

        for (const intent of openIntents) {
          heldByLeash.set(
            intent.leashId,
            (heldByLeash.get(intent.leashId) ?? 0n) + intent.amountCents,
          );
        }

        for (const leashId of LEASH_IDS) {
          const balance = leashBalance(lines, leashId);
          expect(balance.availableCents).toBe(leashAvailableCents.get(leashId) ?? 0n);
          expect(balance.heldCents).toBe(heldByLeash.get(leashId) ?? 0n);
        }
      }),
    );
  });

  test("replay in a different order keeps the ledger balanced", () => {
    fc.assert(
      fc.property(fc.array(operationArbitrary, { maxLength: 12 }), (operations) => {
        const { txns } = playOperations(operations);
        const lines = ledgerLines(txns);

        let total = 0n;

        for (const line of lines) {
          total += line.amountCents;
        }

        expect(total).toBe(0n);
      }),
    );
  });
});

describe("I4 — one money movement per intent", () => {
  test("reported for an intent id exactly when it moved money more than once", () => {
    fc.assert(
      fc.property(fc.nat({ max: 3 }), (movements) => {
        const txns: LedgerTxn[] = [
          contribution({
            txnId: "txn_c",
            kittyId: KITTY_ID,
            memberId: "mem_1",
            amountCents: BigInt(Math.max(movements, 1)) * 100n,
          }),
        ];

        for (let index = 0; index < movements; index += 1) {
          const leashId = `lsh_${index.toString()}`;
          txns.push(
            allocateLeash({
              txnId: `txn_a${index}`,
              kittyId: KITTY_ID,
              leashId,
              amountCents: 100n,
            }),
            reserve({ txnId: `txn_r${index}`, leashId, amountCents: 100n, intentId: "int_1" }),
            settlePayout({
              txnId: `txn_s${index}`,
              leashId,
              payeeEmail: PAYEE,
              amountCents: 100n,
              intentId: "int_1",
            }),
          );
        }

        const violations = checkInvariants(txns);
        const i4 = violations.filter(
          (violation) => violation.code === "I4_MULTIPLE_MONEY_MOVEMENTS",
        );

        expect(violations).toEqual(i4);

        if (movements > 1) {
          expect(i4).toHaveLength(1);
          expect(i4[0]?.count).toBe(movements);
          expect(() => assertSingleMoneyMovement("int_1", txns)).toThrow();
          return;
        }

        expect(i4).toHaveLength(0);
        expect(() => assertSingleMoneyMovement("int_1", txns)).not.toThrow();
      }),
    );
  });
});
