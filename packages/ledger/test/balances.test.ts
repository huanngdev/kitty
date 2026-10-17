import { describe, expect, test } from "bun:test";
import {
  accountKey,
  externalMember,
  kittyAvailable,
  leashAvailable,
  leashHeld,
} from "../src/accounts";
import { balanceOf, balances, leashBalance } from "../src/balances";
import {
  allocateLeash,
  contribution,
  reserve,
  settlePayout,
  type LedgerLine,
} from "../src/entries";

const kittyLine: LedgerLine = { account: accountKey(kittyAvailable("kty_1")), amountCents: 1000n };
const memberLine: LedgerLine = {
  account: accountKey(externalMember("mem_1")),
  amountCents: -1000n,
};

describe("balanceOf", () => {
  test("sums only the lines of the requested account", () => {
    expect(balanceOf([kittyLine, memberLine], accountKey(kittyAvailable("kty_1")))).toBe(1000n);
    expect(balanceOf([kittyLine, memberLine], accountKey(externalMember("mem_1")))).toBe(-1000n);
  });

  test("returns zero for untouched accounts and empty ledgers", () => {
    expect(balanceOf([kittyLine], accountKey(leashHeld("lsh_1")))).toBe(0n);
    expect(balanceOf([], accountKey(kittyAvailable("kty_1")))).toBe(0n);
  });

  test("adds up repeated lines of the same account", () => {
    const lines: LedgerLine[] = [kittyLine, kittyLine, { ...kittyLine, amountCents: -500n }];
    expect(balanceOf(lines, accountKey(kittyAvailable("kty_1")))).toBe(1500n);
  });
});

describe("balances", () => {
  test("maps every touched account to its balance", () => {
    const result = balances([kittyLine, memberLine, { ...kittyLine, amountCents: 250n }]);

    expect(result.get(accountKey(kittyAvailable("kty_1")))).toBe(1250n);
    expect(result.get(accountKey(externalMember("mem_1")))).toBe(-1000n);
    expect(result.size).toBe(2);
    expect(balances([]).size).toBe(0);
  });
});

describe("leashBalance", () => {
  test("reads available and held from the ledger", () => {
    const lines = [
      contribution({ txnId: "txn_1", kittyId: "kty_1", memberId: "mem_1", amountCents: 1000n }),
      allocateLeash({ txnId: "txn_2", kittyId: "kty_1", leashId: "lsh_1", amountCents: 1000n }),
      reserve({ txnId: "txn_3", leashId: "lsh_1", amountCents: 400n, intentId: "int_1" }),
      settlePayout({
        txnId: "txn_4",
        leashId: "lsh_1",
        payeeEmail: "vendor@example.com",
        amountCents: 150n,
        intentId: "int_1",
      }),
    ].flatMap((txn) => txn.lines);

    expect(leashBalance(lines, "lsh_1")).toEqual({ availableCents: 600n, heldCents: 250n });
  });

  test("reports zero for a leash that never moved", () => {
    expect(leashBalance([kittyLine], "lsh_unknown")).toEqual({
      availableCents: 0n,
      heldCents: 0n,
    });
    expect(balanceOf([kittyLine], accountKey(leashAvailable("lsh_1")))).toBe(0n);
  });
});
