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
  TxnArgError,
  allocateLeash,
  contribution,
  delegate,
  kittyIdOfTxn,
  ledgerLines,
  leashIdOfTxn,
  refundMember,
  release,
  reserve,
  revokeLeash,
  settlePayout,
  txnAmount,
  validateTxn,
  type LedgerTxn,
  type TxnArgErrorCode,
  type TxnValidationInvalid,
  type TxnValidationResult,
} from "./entries";

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error("expected the call to throw");
}

function expectArgError(run: () => unknown, code: TxnArgErrorCode, field: string): void {
  const error = captureError(run);
  expect(error).toBeInstanceOf(TxnArgError);

  if (!(error instanceof TxnArgError)) {
    throw new Error("expected a TxnArgError");
  }

  expect(error.code).toBe(code);
  expect(error.field).toBe(field);
  expect(error.name).toBe("TxnArgError");
}

describe("contribution", () => {
  test("moves money from the member to the kitty", () => {
    const txn = contribution({
      txnId: "txn_1",
      kittyId: "kty_1",
      memberId: "mem_1",
      amountCents: 2500n,
    });

    expect(txn).toEqual({
      txnId: "txn_1",
      kind: "contribution",
      lines: [
        { account: "external:member:mem_1", amountCents: -2500n },
        { account: "kitty:kty_1:available", amountCents: 2500n },
      ],
    });
    expect(validateTxn(txn)).toEqual({ ok: true });
  });

  test("rejects zero and negative amounts", () => {
    expectArgError(
      () => contribution({ txnId: "txn_1", kittyId: "kty_1", memberId: "mem_1", amountCents: 0n }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
    expectArgError(
      () => contribution({ txnId: "txn_1", kittyId: "kty_1", memberId: "mem_1", amountCents: -1n }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });

  test("rejects non-bigint amounts from an untyped boundary", () => {
    expectArgError(
      () =>
        contribution({
          txnId: "txn_1",
          kittyId: "kty_1",
          memberId: "mem_1",
          // @ts-expect-error — the runtime guard must survive a JSON boundary that passes numbers
          amountCents: 12.34,
        }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });
});

describe("allocateLeash", () => {
  test("moves money from the kitty to a leash (allocate or top-up)", () => {
    const txn = allocateLeash({
      txnId: "txn_1",
      kittyId: "kty_1",
      leashId: "lsh_1",
      amountCents: 10000n,
    });

    expect(txn).toEqual({
      txnId: "txn_1",
      kind: "allocateLeash",
      lines: [
        { account: "kitty:kty_1:available", amountCents: -10000n },
        { account: "leash:lsh_1:available", amountCents: 10000n },
      ],
    });
    expect(validateTxn(txn)).toEqual({ ok: true });
  });

  test("rejects zero and negative amounts", () => {
    expectArgError(
      () => allocateLeash({ txnId: "txn_1", kittyId: "kty_1", leashId: "lsh_1", amountCents: 0n }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
    expectArgError(
      () => allocateLeash({ txnId: "txn_1", kittyId: "kty_1", leashId: "lsh_1", amountCents: -5n }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });
});

describe("delegate", () => {
  test("cuts the child allocation out of the parent", () => {
    const txn = delegate({
      txnId: "txn_1",
      parentLeashId: "lsh_parent",
      childLeashId: "lsh_child",
      amountCents: 4000n,
    });

    expect(txn).toEqual({
      txnId: "txn_1",
      kind: "delegate",
      lines: [
        { account: "leash:lsh_parent:available", amountCents: -4000n },
        { account: "leash:lsh_child:available", amountCents: 4000n },
      ],
    });
    expect(validateTxn(txn)).toEqual({ ok: true });
  });

  test("rejects a self-delegation and non-positive amounts", () => {
    expectArgError(
      () =>
        delegate({
          txnId: "txn_1",
          parentLeashId: "lsh_1",
          childLeashId: "lsh_1",
          amountCents: 100n,
        }),
      "INVALID_ACCOUNT_ARG",
      "childLeashId",
    );
    expectArgError(
      () =>
        delegate({
          txnId: "txn_1",
          parentLeashId: "lsh_1",
          childLeashId: "lsh_2",
          amountCents: 0n,
        }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });
});

describe("reserve", () => {
  test("moves money from available to held for a spend intent", () => {
    const txn = reserve({
      txnId: "txn_1",
      leashId: "lsh_1",
      amountCents: 1500n,
      intentId: "int_1",
    });

    expect(txn).toEqual({
      txnId: "txn_1",
      kind: "reserve",
      intentId: "int_1",
      lines: [
        { account: "leash:lsh_1:available", amountCents: -1500n },
        { account: "leash:lsh_1:held", amountCents: 1500n },
      ],
    });
    expect(validateTxn(txn)).toEqual({ ok: true });
    expect(leashIdOfTxn(txn)).toBe("lsh_1");
  });

  test("works without an intent id and rejects non-positive amounts", () => {
    expect(reserve({ txnId: "txn_1", leashId: "lsh_1", amountCents: 1n }).intentId).toBeUndefined();
    expectArgError(
      () => reserve({ txnId: "txn_1", leashId: "lsh_1", amountCents: -1n }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });
});

describe("settlePayout", () => {
  test("moves held money out to the payee", () => {
    const txn = settlePayout({
      txnId: "txn_1",
      leashId: "lsh_1",
      payeeEmail: "Vendor@Example.com",
      amountCents: 999n,
      intentId: "int_1",
    });

    expect(txn).toEqual({
      txnId: "txn_1",
      kind: "settlePayout",
      intentId: "int_1",
      lines: [
        { account: "leash:lsh_1:held", amountCents: -999n },
        { account: "external:payee:vendor@example.com", amountCents: 999n },
      ],
    });
    expect(validateTxn(txn)).toEqual({ ok: true });
  });

  test("rejects zero and negative amounts", () => {
    expectArgError(
      () =>
        settlePayout({ txnId: "txn_1", leashId: "lsh_1", payeeEmail: "v@e.com", amountCents: 0n }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });
});

describe("release", () => {
  test("gives the hold back to the leash", () => {
    const txn = release({ txnId: "txn_1", leashId: "lsh_1", amountCents: 500n, intentId: "int_1" });

    expect(txn).toEqual({
      txnId: "txn_1",
      kind: "release",
      intentId: "int_1",
      lines: [
        { account: "leash:lsh_1:held", amountCents: -500n },
        { account: "leash:lsh_1:available", amountCents: 500n },
      ],
    });
    expect(validateTxn(txn)).toEqual({ ok: true });
    expect(release({ txnId: "txn_2", leashId: "lsh_1", amountCents: 1n }).intentId).toBeUndefined();
  });

  test("rejects zero and negative amounts", () => {
    expectArgError(
      () => release({ txnId: "txn_1", leashId: "lsh_1", amountCents: -2n }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });
});

describe("revokeLeash", () => {
  test("returns money to the kitty or to the parent leash", () => {
    const toKitty = revokeLeash({
      txnId: "txn_1",
      leashId: "lsh_1",
      returnTo: kittyAvailable("kty_1"),
      amountCents: 700n,
    });
    expect(toKitty).toEqual({
      txnId: "txn_1",
      kind: "revokeLeash",
      lines: [
        { account: "leash:lsh_1:available", amountCents: -700n },
        { account: "kitty:kty_1:available", amountCents: 700n },
      ],
    });
    expect(validateTxn(toKitty)).toEqual({ ok: true });
    expect(toKitty.lines[1]?.account).toBe(accountKey(kittyAvailable("kty_1")));

    const toParent = revokeLeash({
      txnId: "txn_2",
      leashId: "lsh_child",
      returnTo: leashAvailable("lsh_parent"),
      amountCents: 300n,
    });
    expect(toParent.lines[1]).toEqual({
      account: "leash:lsh_parent:available",
      amountCents: 300n,
    });
    expect(validateTxn(toParent)).toEqual({ ok: true });
  });

  test("rejects returning money to itself, to a held bucket or to an external account", () => {
    expectArgError(
      () =>
        revokeLeash({
          txnId: "txn_1",
          leashId: "lsh_1",
          returnTo: leashAvailable("lsh_1"),
          amountCents: 100n,
        }),
      "INVALID_ACCOUNT_ARG",
      "returnTo",
    );
    expectArgError(
      () =>
        revokeLeash({
          txnId: "txn_1",
          leashId: "lsh_1",
          returnTo: leashHeld("lsh_parent"),
          amountCents: 100n,
        }),
      "INVALID_ACCOUNT_ARG",
      "returnTo",
    );
    expectArgError(
      () =>
        revokeLeash({
          txnId: "txn_1",
          leashId: "lsh_1",
          returnTo: externalMember("mem_1"),
          amountCents: 100n,
        }),
      "INVALID_ACCOUNT_ARG",
      "returnTo",
    );
    expectArgError(
      () =>
        revokeLeash({
          txnId: "txn_1",
          leashId: "lsh_1",
          returnTo: externalPayee("bob@example.com"),
          amountCents: 100n,
        }),
      "INVALID_ACCOUNT_ARG",
      "returnTo",
    );
    expectArgError(
      () =>
        revokeLeash({
          txnId: "txn_1",
          leashId: "lsh_1",
          returnTo: kittyAvailable("kty_1"),
          amountCents: 0n,
        }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });
});

describe("refundMember", () => {
  test("refunds from the kitty or from the Treasurer leash held bucket", () => {
    const fromKitty = refundMember({
      txnId: "txn_1",
      memberId: "mem_1",
      from: kittyAvailable("kty_1"),
      amountCents: 1200n,
    });
    expect(fromKitty).toEqual({
      txnId: "txn_1",
      kind: "refundMember",
      lines: [
        { account: "kitty:kty_1:available", amountCents: -1200n },
        { account: "external:member:mem_1", amountCents: 1200n },
      ],
    });
    expect(validateTxn(fromKitty)).toEqual({ ok: true });

    const fromLeash = refundMember({
      txnId: "txn_2",
      memberId: "mem_1",
      from: leashHeld("lsh_treasurer"),
      amountCents: 100n,
    });
    expect(fromLeash.lines[0]).toEqual({
      account: "leash:lsh_treasurer:held",
      amountCents: -100n,
    });
    expect(validateTxn(fromLeash)).toEqual({ ok: true });
  });

  test("rejects sources that cannot fund a refund", () => {
    expectArgError(
      () =>
        refundMember({
          txnId: "txn_1",
          memberId: "mem_1",
          from: leashAvailable("lsh_treasurer"),
          amountCents: 100n,
        }),
      "INVALID_ACCOUNT_ARG",
      "from",
    );
    expectArgError(
      () =>
        refundMember({
          txnId: "txn_1",
          memberId: "mem_1",
          from: externalPayee("bob@example.com"),
          amountCents: 100n,
        }),
      "INVALID_ACCOUNT_ARG",
      "from",
    );
    expectArgError(
      () =>
        refundMember({
          txnId: "txn_1",
          memberId: "mem_1",
          from: kittyAvailable("kty_1"),
          amountCents: 0n,
        }),
      "NEGATIVE_AMOUNT_ARG",
      "amountCents",
    );
  });
});

describe("validateTxn", () => {
  const memberLine = { account: "external:member:mem_1", amountCents: -100n };
  const kittyLine = { account: "kitty:kty_1:available", amountCents: 100n };

  function expectInvalid(result: TxnValidationResult): TxnValidationInvalid {
    if (result.ok) {
      throw new Error("expected the transaction to be invalid");
    }

    return result;
  }

  test("accepts a balanced two-line transaction", () => {
    expect(
      validateTxn({ txnId: "txn_1", kind: "contribution", lines: [memberLine, kittyLine] }),
    ).toEqual({ ok: true });
  });

  test("accepts a balanced transaction with more than two lines", () => {
    const result = validateTxn({
      txnId: "txn_1",
      kind: "contribution",
      lines: [
        memberLine,
        { account: "kitty:kty_1:available", amountCents: 60n },
        { account: "external:payee:bob@example.com", amountCents: 40n },
      ],
    });
    expect(result).toEqual({ ok: true });
  });

  test("reports EMPTY", () => {
    const invalid = expectInvalid(validateTxn({ txnId: "txn_1", kind: "contribution", lines: [] }));
    expect(invalid.code).toBe("EMPTY");
    expect(invalid.message).toContain("txn_1");
  });

  test("reports TOO_FEW_LINES", () => {
    const invalid = expectInvalid(
      validateTxn({ txnId: "txn_1", kind: "contribution", lines: [kittyLine] }),
    );
    expect(invalid.code).toBe("TOO_FEW_LINES");
    expect(invalid.lineIndex).toBe(0);
  });

  test("reports UNKNOWN_ACCOUNT", () => {
    const invalid = expectInvalid(
      validateTxn({
        txnId: "txn_1",
        kind: "contribution",
        lines: [{ account: "bogus:thing", amountCents: 100n }, kittyLine],
      }),
    );
    expect(invalid.code).toBe("UNKNOWN_ACCOUNT");
    expect(invalid.account).toBe("bogus:thing");
    expect(invalid.lineIndex).toBe(0);
  });

  test("reports ZERO_LINE", () => {
    const invalid = expectInvalid(
      validateTxn({
        txnId: "txn_1",
        kind: "contribution",
        lines: [{ account: "external:member:mem_1", amountCents: 0n }, kittyLine],
      }),
    );
    expect(invalid.code).toBe("ZERO_LINE");
    expect(invalid.lineIndex).toBe(0);
  });

  test("reports DUPLICATE_ACCOUNT", () => {
    const invalid = expectInvalid(
      validateTxn({
        txnId: "txn_1",
        kind: "contribution",
        lines: [kittyLine, { account: "kitty:kty_1:available", amountCents: -100n }],
      }),
    );
    expect(invalid.code).toBe("DUPLICATE_ACCOUNT");
    expect(invalid.lineIndex).toBe(1);
  });

  test("reports UNBALANCED with the sum", () => {
    const invalid = expectInvalid(
      validateTxn({
        txnId: "txn_1",
        kind: "contribution",
        lines: [memberLine, { account: "kitty:kty_1:available", amountCents: 50n }],
      }),
    );
    expect(invalid.code).toBe("UNBALANCED");
    expect(invalid.sumCents).toBe(-50n);
  });
});

describe("ledger helpers", () => {
  const first = contribution({
    txnId: "txn_1",
    kittyId: "kty_1",
    memberId: "mem_1",
    amountCents: 100n,
  });
  const second = allocateLeash({
    txnId: "txn_2",
    kittyId: "kty_1",
    leashId: "lsh_1",
    amountCents: 100n,
  });

  test("ledgerLines flattens transactions in order", () => {
    expect(ledgerLines([first, second])).toEqual([...first.lines, ...second.lines]);
    expect(ledgerLines([])).toEqual([]);
  });

  test("txnAmount is the money a transaction moves", () => {
    expect(txnAmount(first)).toBe(100n);
    expect(txnAmount(second)).toBe(100n);
    expect(txnAmount({ txnId: "txn_3", kind: "contribution", lines: [] })).toBe(0n);
  });

  test("leashIdOfTxn finds the leash, skipping unknown accounts", () => {
    expect(leashIdOfTxn(second)).toBe("lsh_1");
    expect(leashIdOfTxn(first)).toBeUndefined();
    expect(
      leashIdOfTxn({
        txnId: "txn_3",
        kind: "release",
        lines: [
          { account: "bogus:thing", amountCents: -1n },
          { account: "leash:lsh_9:available", amountCents: 1n },
        ],
      }),
    ).toBe("lsh_9");
  });

  test("kittyIdOfTxn finds the kitty, skipping unknown accounts", () => {
    expect(kittyIdOfTxn(first)).toBe("kty_1");
    expect(kittyIdOfTxn(second)).toBe("kty_1");
    expect(
      kittyIdOfTxn({
        txnId: "txn_3",
        kind: "release",
        lines: [
          { account: "bogus:thing", amountCents: -1n },
          { account: "leash:lsh_9:held", amountCents: 1n },
        ],
      }),
    ).toBeUndefined();
  });

  test("helpers accept hand-written transactions of any kind", () => {
    const raw: LedgerTxn = {
      txnId: "txn_raw",
      kind: "settlePayout",
      lines: [
        { account: "leash:lsh_1:held", amountCents: -10n },
        { account: "external:payee:bob@example.com", amountCents: 10n },
      ],
    };
    expect(txnAmount(raw)).toBe(10n);
    expect(leashIdOfTxn(raw)).toBe("lsh_1");
  });
});
