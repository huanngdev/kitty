import { describe, expect, test } from "bun:test";
import {
  accountKey,
  externalMember,
  externalPayee,
  kittyAvailable,
  leashAvailable,
  leashHeld,
} from "./accounts";
import {
  allocateLeash,
  contribution,
  delegate,
  refundMember,
  release,
  reserve,
  settlePayout,
  type LedgerTxn,
} from "./entries";
import {
  MultipleMoneyMovementsError,
  assertSingleMoneyMovement,
  checkInvariants,
  type InvariantViolation,
} from "./invariants";

const KITTY = "kty_1";
const MEMBER = "mem_1";
const PAYEE = "vendor@example.com";
const ROOT = "lsh_root";
const CHILD = "lsh_child";

const leashParentOf = new Map<string, string>([[CHILD, ROOT]]);

function codesOf(violations: readonly InvariantViolation[]): string[] {
  return violations.map((violation) => violation.code);
}

function healthyLedger(): LedgerTxn[] {
  return [
    contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 10000n }),
    allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 5000n }),
    delegate({ txnId: "txn_3", parentLeashId: ROOT, childLeashId: CHILD, amountCents: 2000n }),
    reserve({ txnId: "txn_4", leashId: CHILD, amountCents: 1500n, intentId: "int_1" }),
    settlePayout({
      txnId: "txn_5",
      leashId: CHILD,
      payeeEmail: PAYEE,
      amountCents: 1500n,
      intentId: "int_1",
    }),
    reserve({ txnId: "txn_6", leashId: ROOT, amountCents: 500n, intentId: "int_2" }),
    release({ txnId: "txn_7", leashId: ROOT, amountCents: 500n, intentId: "int_2" }),
    refundMember({
      txnId: "txn_8",
      memberId: MEMBER,
      from: kittyAvailable(KITTY),
      amountCents: 1000n,
    }),
  ];
}

describe("checkInvariants on a healthy ledger", () => {
  test("reports no violation", () => {
    expect(checkInvariants(healthyLedger(), { leashParentOf })).toEqual([]);
  });

  test("can be called without options", () => {
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 500n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 500n }),
    ];

    expect(checkInvariants(txns)).toEqual([]);
  });

  test("requires the parent map to size a delegated leash", () => {
    const violations = checkInvariants(healthyLedger());
    const allocation = violations.filter(
      (violation) => violation.code === "I3_TREE_OVER_ALLOCATION",
    );

    expect(allocation).toHaveLength(1);
    expect(allocation[0]?.leashId).toBe(CHILD);
    expect(allocation[0]?.expectedCents).toBe(0n);
    expect(allocation[0]?.actualCents).toBe(2000n);
  });

  test("attributes every child of the same parent", () => {
    const parentsOfTwo = new Map<string, string>([
      [CHILD, ROOT],
      ["lsh_child2", ROOT],
    ]);
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 1000n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 600n }),
      delegate({ txnId: "txn_3", parentLeashId: ROOT, childLeashId: CHILD, amountCents: 200n }),
      delegate({
        txnId: "txn_4",
        parentLeashId: ROOT,
        childLeashId: "lsh_child2",
        amountCents: 200n,
      }),
    ];

    expect(checkInvariants(txns, { leashParentOf: parentsOfTwo })).toEqual([]);
  });

  test("attributes a sub-leash to its parent's kitty through the tree", () => {
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 500n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 500n }),
      delegate({ txnId: "txn_3", parentLeashId: ROOT, childLeashId: CHILD, amountCents: 200n }),
    ];

    expect(checkInvariants(txns, { leashParentOf })).toEqual([]);
  });

  test("skips children that already have their own allocation", () => {
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 1000n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 300n }),
      allocateLeash({ txnId: "txn_3", kittyId: KITTY, leashId: CHILD, amountCents: 200n }),
      delegate({ txnId: "txn_4", parentLeashId: ROOT, childLeashId: CHILD, amountCents: 100n }),
    ];

    expect(checkInvariants(txns, { leashParentOf })).toEqual([]);
  });

  test("accepts an explicit kitty mapping for known leashes", () => {
    const kittyOfLeash = new Map<string, string>([
      [ROOT, KITTY],
      [CHILD, KITTY],
    ]);
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 500n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 500n }),
      delegate({ txnId: "txn_3", parentLeashId: ROOT, childLeashId: CHILD, amountCents: 200n }),
    ];

    expect(checkInvariants(txns, { kittyOfLeash, leashParentOf })).toEqual([]);
  });
});

describe("I1 — the ledger sums to zero", () => {
  test("reports a ledger that does not cancel out", () => {
    const txns: LedgerTxn[] = [
      {
        txnId: "txn_1",
        kind: "contribution",
        lines: [
          { account: accountKey(externalMember(MEMBER)), amountCents: -100n },
          { account: "external:payee:bob@example.com", amountCents: 50n },
        ],
      },
    ];

    const violations = checkInvariants(txns);

    expect(codesOf(violations)).toEqual(["I1_UNBALANCED_LEDGER"]);
    expect(violations[0]?.actualCents).toBe(-50n);
    expect(violations[0]?.message).toContain("-0.50");
  });

  test("reports a kitty whose internal buckets disagree with its flows", () => {
    const txns: LedgerTxn[] = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 1000n }),
      {
        txnId: "txn_2",
        kind: "release",
        lines: [
          { account: "kitty:kty_1:available", amountCents: -300n },
          { account: "external:payee:bob@example.com", amountCents: 300n },
        ],
      },
    ];

    const violations = checkInvariants(txns);

    expect(codesOf(violations)).toEqual(["I1_KITTY_MISMATCH"]);
    expect(violations[0]?.kittyId).toBe(KITTY);
    expect(violations[0]?.expectedCents).toBe(1000n);
    expect(violations[0]?.actualCents).toBe(700n);
  });

  test("reports a kitty that holds money without any contribution flow", () => {
    const txns: LedgerTxn[] = [
      {
        txnId: "txn_1",
        kind: "delegate",
        lines: [
          { account: "external:member:mem_1", amountCents: -100n },
          { account: "leash:lsh_root:available", amountCents: 100n },
        ],
      },
    ];

    const violations = checkInvariants(txns, {
      kittyOfLeash: new Map<string, string>([[ROOT, KITTY]]),
    });

    expect(codesOf(violations)).toEqual(["I1_KITTY_MISMATCH", "I3_TREE_OVER_ALLOCATION"]);
    expect(violations[0]?.expectedCents).toBe(0n);
  });

  test("reports an internal bucket that cannot be traced to a kitty", () => {
    const txns: LedgerTxn[] = [
      {
        txnId: "txn_1",
        kind: "contribution",
        lines: [
          { account: "external:member:mem_1", amountCents: -500n },
          { account: "leash:lsh_root:available", amountCents: 500n },
        ],
      },
    ];

    const violations = checkInvariants(txns);

    expect(codesOf(violations)).toEqual(["UNATTRIBUTED_KITTY", "I3_TREE_OVER_ALLOCATION"]);
    expect(violations[0]?.account).toBe("leash:lsh_root:available");
    expect(violations[0]?.message).toContain("kittyOfLeash");

    const mapped = checkInvariants(txns, {
      kittyOfLeash: new Map<string, string>([[ROOT, KITTY]]),
    });
    expect(codesOf(mapped)).toEqual(["I3_TREE_OVER_ALLOCATION"]);
  });

  test("reports an account key that is not a bucket", () => {
    const txns: LedgerTxn[] = [
      {
        txnId: "txn_1",
        kind: "contribution",
        lines: [
          { account: "external:member:mem_1", amountCents: -100n },
          { account: "bogus:thing", amountCents: 100n },
        ],
      },
    ];

    const violations = checkInvariants(txns);

    expect(codesOf(violations)).toEqual(["UNKNOWN_ACCOUNT"]);
    expect(violations[0]?.account).toBe("bogus:thing");
  });
});

describe("I2 — internal buckets never go negative", () => {
  test("reports the first transaction that overdraws a bucket", () => {
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 1000n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 300n }),
      reserve({ txnId: "txn_3", leashId: ROOT, amountCents: 500n, intentId: "int_1" }),
      reserve({ txnId: "txn_4", leashId: ROOT, amountCents: 50n, intentId: "int_2" }),
    ];

    const violations = checkInvariants(txns, { leashParentOf });

    expect(codesOf(violations)).toEqual(["I2_NEGATIVE_BUCKET"]);
    expect(violations[0]?.txnId).toBe("txn_3");
    expect(violations[0]?.account).toBe("leash:lsh_root:available");
    expect(violations[0]?.actualCents).toBe(-200n);
  });

  test("reports every bucket broken by the same transaction", () => {
    const txns: LedgerTxn[] = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 100n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 100n }),
      delegate({ txnId: "txn_3", parentLeashId: ROOT, childLeashId: CHILD, amountCents: 100n }),
      {
        txnId: "txn_4",
        kind: "revokeLeash",
        lines: [
          { account: "leash:lsh_root:available", amountCents: -200n },
          { account: "leash:lsh_child:available", amountCents: -150n },
          { account: "leash:lsh_root:held", amountCents: 350n },
        ],
      },
    ];

    const violations = checkInvariants(txns, { leashParentOf });

    expect(violations.map((violation) => violation.account).sort()).toEqual([
      "leash:lsh_child:available",
      "leash:lsh_root:available",
    ]);
    expect(violations.every((violation) => violation.code === "I2_NEGATIVE_BUCKET")).toBe(true);
    expect(violations.every((violation) => violation.txnId === "txn_4")).toBe(true);
  });

  test("ignores negative external balances", () => {
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 100n }),
    ];

    expect(checkInvariants(txns)).toEqual([]);
  });
});

describe("I3 — a leash tree never exceeds its allocation", () => {
  test("reports money that entered a tree from outside its allocation", () => {
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 1000n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: "lsh_a", amountCents: 500n }),
      allocateLeash({ txnId: "txn_3", kittyId: KITTY, leashId: ROOT, amountCents: 500n }),
      delegate({ txnId: "txn_4", parentLeashId: "lsh_a", childLeashId: CHILD, amountCents: 200n }),
    ];

    const violations = checkInvariants(txns, { leashParentOf });

    expect(codesOf(violations)).toEqual(["I3_TREE_OVER_ALLOCATION"]);
    expect(violations[0]?.leashId).toBe(ROOT);
    expect(violations[0]?.expectedCents).toBe(500n);
    expect(violations[0]?.actualCents).toBe(700n);
  });

  test("counts settled payouts as part of the tree", () => {
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 1000n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 500n }),
      reserve({ txnId: "txn_3", leashId: ROOT, amountCents: 500n, intentId: "int_1" }),
      settlePayout({
        txnId: "txn_4",
        leashId: ROOT,
        payeeEmail: PAYEE,
        amountCents: 500n,
        intentId: "int_1",
      }),
    ];

    expect(checkInvariants(txns)).toEqual([]);
  });

  test("ignores an allocation transaction that names no kitty", () => {
    const txns: LedgerTxn[] = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 1000n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 500n }),
      {
        txnId: "txn_3",
        kind: "allocateLeash",
        lines: [
          { account: "leash:lsh_root:available", amountCents: -200n },
          { account: "leash:lsh_other:available", amountCents: 200n },
        ],
      },
    ];

    const violations = checkInvariants(txns, { leashParentOf });

    expect(codesOf(violations)).toEqual([
      "UNATTRIBUTED_KITTY",
      "I1_KITTY_MISMATCH",
      "I3_TREE_OVER_ALLOCATION",
    ]);
    expect(violations[0]?.account).toBe("leash:lsh_other:available");
  });
});

describe("I4 — one money movement per intent", () => {
  function doubleSettle(): LedgerTxn[] {
    return [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 2000n }),
      allocateLeash({ txnId: "txn_2", kittyId: KITTY, leashId: ROOT, amountCents: 1000n }),
      allocateLeash({ txnId: "txn_3", kittyId: KITTY, leashId: CHILD, amountCents: 1000n }),
      reserve({ txnId: "txn_4", leashId: ROOT, amountCents: 1000n, intentId: "int_1" }),
      reserve({ txnId: "txn_5", leashId: CHILD, amountCents: 1000n, intentId: "int_1" }),
      settlePayout({
        txnId: "txn_6",
        leashId: ROOT,
        payeeEmail: PAYEE,
        amountCents: 1000n,
        intentId: "int_1",
      }),
      settlePayout({
        txnId: "txn_7",
        leashId: CHILD,
        payeeEmail: PAYEE,
        amountCents: 1000n,
        intentId: "int_1",
      }),
    ];
  }

  test("reports an intent that paid out twice", () => {
    const violations = checkInvariants(doubleSettle(), { leashParentOf });

    expect(codesOf(violations)).toEqual(["I4_MULTIPLE_MONEY_MOVEMENTS"]);
    expect(violations[0]?.intentId).toBe("int_1");
    expect(violations[0]?.count).toBe(2);
  });

  test("assertSingleMoneyMovement throws on the second movement", () => {
    const error = (() => {
      try {
        assertSingleMoneyMovement("int_1", doubleSettle());
      } catch (caught) {
        return caught;
      }

      throw new Error("expected assertSingleMoneyMovement to throw");
    })();

    expect(error).toBeInstanceOf(MultipleMoneyMovementsError);

    if (!(error instanceof MultipleMoneyMovementsError)) {
      throw new Error("expected a MultipleMoneyMovementsError");
    }

    expect(error.name).toBe("MultipleMoneyMovementsError");
    expect(error.code).toBe("I4_MULTIPLE_MONEY_MOVEMENTS");
    expect(error.intentId).toBe("int_1");
    expect(error.count).toBe(2);
    expect(error.message).toContain("int_1");
  });

  test("assertSingleMoneyMovement accepts one movement, no movement and unknown intents", () => {
    const txns = healthyLedger();

    expect(() => assertSingleMoneyMovement("int_1", txns)).not.toThrow();
    expect(() => assertSingleMoneyMovement("int_2", txns)).not.toThrow();
    expect(() => assertSingleMoneyMovement("int_missing", txns)).not.toThrow();
  });

  test("a reserve and its release are not money movements", () => {
    const txns = [
      allocateLeash({ txnId: "txn_1", kittyId: KITTY, leashId: ROOT, amountCents: 400n }),
      reserve({ txnId: "txn_2", leashId: ROOT, amountCents: 400n, intentId: "int_1" }),
      release({ txnId: "txn_3", leashId: ROOT, amountCents: 400n, intentId: "int_1" }),
    ];

    expect(() => assertSingleMoneyMovement("int_1", txns)).not.toThrow();
  });

  test("refunds count as money movements", () => {
    const txns = [
      contribution({ txnId: "txn_1", kittyId: KITTY, memberId: MEMBER, amountCents: 900n }),
      refundMember({
        txnId: "txn_2",
        memberId: MEMBER,
        from: kittyAvailable(KITTY),
        amountCents: 100n,
      }),
      refundMember({
        txnId: "txn_3",
        memberId: MEMBER,
        from: kittyAvailable(KITTY),
        amountCents: 100n,
      }),
    ];

    const withIntent: LedgerTxn[] = txns.map((txn, index) =>
      index === 0 ? txn : { ...txn, intentId: "int_9" },
    );

    expect(codesOf(checkInvariants(withIntent))).toEqual(["I4_MULTIPLE_MONEY_MOVEMENTS"]);
    expect(() => assertSingleMoneyMovement("int_9", withIntent)).toThrow(
      MultipleMoneyMovementsError,
    );
  });
});

describe("helpers", () => {
  test("the lease and payee builders used in tests stay canonical", () => {
    expect(leashAvailable(ROOT)).toEqual({ kind: "leash", leashId: ROOT, bucket: "available" });
    expect(leashHeld(ROOT)).toEqual({ kind: "leash", leashId: ROOT, bucket: "held" });
    expect(externalPayee("BOB@EXAMPLE.COM").payeeEmail).toBe("bob@example.com");
  });
});
