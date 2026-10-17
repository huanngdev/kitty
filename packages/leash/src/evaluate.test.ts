import { describe, expect, test } from "bun:test";

import { evaluate } from "./evaluate";
import type { Decision, EvaluateInput, Leash } from "./types";
import {
  NOW,
  makeInput,
  makeIntent,
  makeLeash,
  makeRecentIntent,
  makeUsage,
} from "./test-support/factories";

function codesOf(decision: Decision): string[] {
  return decision.outcome === "ALLOW" ? [] : decision.reasons.map((reason) => reason.code);
}

function reasonFor(decision: Decision, code: string): string {
  if (decision.outcome === "ALLOW") {
    throw new Error("expected a non-ALLOW decision");
  }
  const reason = decision.reasons.find((candidate) => candidate.code === code);
  if (reason === undefined) {
    throw new Error(`missing reason ${code}`);
  }
  return reason.details;
}

function validAncestor(overrides: Partial<Leash> = {}): Leash {
  return makeLeash({
    id: "lsh_01PARENTPARENTPARENTPARENTPAR",
    parentId: null,
    limits: { perTxMaxCents: 40_000n, dailyMaxCents: 50_000n, maxTxPerHour: 5 },
    ...overrides,
  });
}

function withAncestor(
  ancestor: Leash,
  usage = makeUsage({ availableCents: 50_000n }),
): Partial<EvaluateInput> {
  return { ancestors: [ancestor], ancestorUsage: { [ancestor.id]: usage } };
}

describe("evaluate — happy path", () => {
  test("a fully valid intent is ALLOW with no reasons", () => {
    expect(evaluate(makeInput())).toEqual({ outcome: "ALLOW" });
  });

  test("ALLOW works with a valid ancestor chain", () => {
    const ancestor = validAncestor();
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(decision).toEqual({ outcome: "ALLOW" });
  });
});

describe("evaluate — check 1: leash status", () => {
  const cases = [
    ["paused", "LEASH_PAUSED"],
    ["revoked", "LEASH_REVOKED"],
    ["exhausted", "LEASH_EXHAUSTED"],
    ["expired", "LEASH_EXPIRED"],
  ] as const;

  for (const [status, code] of cases) {
    test(`status ${status} denies with ${code}`, () => {
      const decision = evaluate(makeInput({ leash: makeLeash({ status }) }));
      expect(decision.outcome).toBe("DENY");
      expect(codesOf(decision)).toContain(code);
    });
  }
});

describe("evaluate — check 2: validity window", () => {
  test("notBefore in the future yields LEASH_NOT_YET_VALID", () => {
    const decision = evaluate(
      makeInput({ leash: makeLeash({ notBefore: "2026-12-01T00:00:00.000Z" }) }),
    );
    expect(codesOf(decision)).toEqual(["LEASH_NOT_YET_VALID"]);
  });

  test("expiresAt is exclusive: at expiresAt the leash has expired", () => {
    const decision = evaluate(makeInput({ leash: makeLeash({ expiresAt: NOW }) }));
    expect(codesOf(decision)).toEqual(["LEASH_EXPIRED"]);
  });

  test("notBefore is inclusive: exactly at notBefore is still valid", () => {
    const decision = evaluate(makeInput({ leash: makeLeash({ notBefore: NOW }) }));
    expect(decision.outcome).toBe("ALLOW");
  });

  test("a malformed notBefore fails closed with LEASH_NOT_YET_VALID", () => {
    const decision = evaluate(makeInput({ leash: makeLeash({ notBefore: "not-a-date" }) }));
    expect(codesOf(decision)).toEqual(["LEASH_NOT_YET_VALID"]);
    expect(reasonFor(decision, "LEASH_NOT_YET_VALID")).toContain("invalid date");
  });

  test("a malformed expiresAt fails closed with LEASH_EXPIRED", () => {
    const decision = evaluate(makeInput({ leash: makeLeash({ expiresAt: "" }) }));
    expect(codesOf(decision)).toEqual(["LEASH_EXPIRED"]);
    expect(reasonFor(decision, "LEASH_EXPIRED")).toContain("invalid date");
  });

  test("a malformed now is a programmer error", () => {
    expect(() => evaluate(makeInput({ now: "not-a-date" }))).toThrow(RangeError);
  });
});

describe("evaluate — check 3: ancestors active and valid", () => {
  test("inactive ancestor yields PARENT_LEASH_INACTIVE", () => {
    const ancestor = validAncestor({ status: "paused" });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(codesOf(decision)).toContain("PARENT_LEASH_INACTIVE");
    expect(reasonFor(decision, "PARENT_LEASH_INACTIVE")).toContain("paused");
  });

  test("ancestor not yet valid yields PARENT_LEASH_INACTIVE", () => {
    const ancestor = validAncestor({ notBefore: "2026-12-01T00:00:00.000Z" });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(reasonFor(decision, "PARENT_LEASH_INACTIVE")).toContain("not yet valid");
  });

  test("expired ancestor yields PARENT_LEASH_INACTIVE", () => {
    const ancestor = validAncestor({ expiresAt: "2026-11-01T00:00:00.000Z" });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(reasonFor(decision, "PARENT_LEASH_INACTIVE")).toContain("expired");
  });

  test("a malformed ancestor notBefore fails closed", () => {
    const ancestor = validAncestor({ notBefore: "not-a-date" });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(reasonFor(decision, "PARENT_LEASH_INACTIVE")).toContain("invalid date");
  });

  test("a malformed ancestor expiresAt fails closed", () => {
    const ancestor = validAncestor({ expiresAt: "" });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(reasonFor(decision, "PARENT_LEASH_INACTIVE")).toContain("invalid date");
  });
});

describe("evaluate — check 4: currency", () => {
  test("a mismatched intent currency yields CURRENCY_MISMATCH", () => {
    const decision = evaluate(makeInput({ intent: makeIntent({ currency: "EUR" }) }));
    expect(codesOf(decision)).toEqual(["CURRENCY_MISMATCH"]);
  });
});

describe("evaluate — check 5: action allow-list", () => {
  test("an action outside the allow-list yields ACTION_NOT_ALLOWED", () => {
    const decision = evaluate(makeInput({ leash: makeLeash({ allowedActions: ["refund"] }) }));
    expect(codesOf(decision)).toContain("ACTION_NOT_ALLOWED");
  });
});

describe("evaluate — check 6: payee allow-list", () => {
  test("a money action that needs a payee but has none is denied", () => {
    const decision = evaluate(makeInput({ intent: makeIntent({ payee: undefined }) }));
    expect(codesOf(decision)).toEqual(["PAYEE_NOT_ALLOWED"]);
    expect(reasonFor(decision, "PAYEE_NOT_ALLOWED")).toContain("requires a payee");
  });

  test("an empty-string payee is treated as missing", () => {
    const decision = evaluate(makeInput({ intent: makeIntent({ payee: "" }) }));
    expect(codesOf(decision)).toEqual(["PAYEE_NOT_ALLOWED"]);
  });

  test("a payee outside the allow-list is denied", () => {
    const decision = evaluate(makeInput({ intent: makeIntent({ payee: "evil@example.com" }) }));
    expect(codesOf(decision)).toEqual(["PAYEE_NOT_ALLOWED"]);
    expect(reasonFor(decision, "PAYEE_NOT_ALLOWED")).toContain("evil@example.com");
  });

  test("member:* allows a member payee for create_invoice", () => {
    const decision = evaluate(
      makeInput({
        leash: makeLeash({ allowedActions: ["create_invoice"], allowedPayees: ["member:*"] }),
        intent: makeIntent({
          action: "create_invoice",
          payee: "member:mem_01AAA",
          amountCents: 10_000n,
        }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });

  test("payee comparison is case-insensitive", () => {
    const decision = evaluate(
      makeInput({ intent: makeIntent({ payee: "MERCH-SHOP@VENDOR.EXAMPLE" }) }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });

  test("actions that do not need a payee skip the payee check", () => {
    const decision = evaluate(
      makeInput({
        leash: makeLeash({ allowedActions: ["delegate"], allowedPayees: ["someone@else.example"] }),
        intent: makeIntent({ action: "delegate", payee: "evil@example.com", amountCents: 5_000n }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });
});

describe("evaluate — check 7: category allow-list", () => {
  test("a disallowed category yields CATEGORY_NOT_ALLOWED", () => {
    const decision = evaluate(makeInput({ intent: makeIntent({ category: "food" }) }));
    expect(codesOf(decision)).toEqual(["CATEGORY_NOT_ALLOWED"]);
  });

  test("a missing category skips the category check", () => {
    const decision = evaluate(
      makeInput({
        leash: makeLeash({ allowedCategories: ["lodging"] }),
        intent: makeIntent({ category: undefined }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });

  test("the wildcard allows every category", () => {
    const decision = evaluate(
      makeInput({
        leash: makeLeash({ allowedCategories: ["*"] }),
        intent: makeIntent({ category: "activities" }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });
});

describe("evaluate — check 8: amount well-formedness", () => {
  test("a money action with amount 0 is invalid", () => {
    const decision = evaluate(makeInput({ intent: makeIntent({ amountCents: 0n }) }));
    expect(codesOf(decision)).toEqual(["INVALID_AMOUNT"]);
  });

  test("a money action with a negative amount is invalid", () => {
    const decision = evaluate(makeInput({ intent: makeIntent({ amountCents: -5n }) }));
    expect(codesOf(decision)).toEqual(["INVALID_AMOUNT"]);
  });

  test("a zero-amount action with a non-zero amount is invalid", () => {
    const decision = evaluate(
      makeInput({
        leash: makeLeash({ allowedActions: ["send_reminder"], allowedCategories: ["*"] }),
        intent: makeIntent({ action: "send_reminder", amountCents: 100n }),
      }),
    );
    expect(codesOf(decision)).toEqual(["INVALID_AMOUNT"]);
  });

  test("a zero-amount action with amount 0 passes", () => {
    const decision = evaluate(
      makeInput({
        leash: makeLeash({ allowedActions: ["send_reminder"], allowedCategories: ["*"] }),
        intent: makeIntent({ action: "send_reminder", amountCents: 0n }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });
});

describe("evaluate — checks 9 to 12: numeric limits", () => {
  test("amount above perTxMax yields AMOUNT_EXCEEDS_PER_TX", () => {
    const decision = evaluate(makeInput({ intent: makeIntent({ amountCents: 45_000n }) }));
    expect(codesOf(decision)).toEqual(["AMOUNT_EXCEEDS_PER_TX"]);
  });

  test("spent24h plus amount above dailyMax yields DAILY_LIMIT_EXCEEDED", () => {
    const decision = evaluate(
      makeInput({
        usage: makeUsage({ spent24hCents: 30_000n }),
        intent: makeIntent({ amountCents: 30_000n }),
      }),
    );
    expect(codesOf(decision)).toEqual(["DAILY_LIMIT_EXCEEDED"]);
  });

  test("amount above available yields INSUFFICIENT_LEASH_BALANCE", () => {
    const decision = evaluate(
      makeInput({
        usage: makeUsage({ availableCents: 1_000n }),
        intent: makeIntent({ amountCents: 5_000n }),
      }),
    );
    expect(codesOf(decision)).toEqual(["INSUFFICIENT_LEASH_BALANCE"]);
  });

  test("reaching maxTxPerHour yields RATE_LIMITED", () => {
    const decision = evaluate(makeInput({ usage: makeUsage({ allowCountLastHour: 5 }) }));
    expect(codesOf(decision)).toEqual(["RATE_LIMITED"]);
  });

  test("the daily and per-tx boundaries are inclusive", () => {
    const decision = evaluate(
      makeInput({
        usage: makeUsage({ availableCents: 40_000n, spent24hCents: 10_000n }),
        intent: makeIntent({ amountCents: 40_000n }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });
});

describe("evaluate — check 13: duplicate detection", () => {
  test("a matching recent intent yields STEP_UP with POSSIBLE_DUPLICATE", () => {
    const decision = evaluate(
      makeInput({ usage: makeUsage({ recentIntents: [makeRecentIntent()] }) }),
    );
    expect(decision.outcome).toBe("STEP_UP");
    expect(codesOf(decision)).toEqual(["POSSIBLE_DUPLICATE"]);
  });

  test("the same intentId is never a duplicate", () => {
    const decision = evaluate(
      makeInput({
        usage: makeUsage({
          recentIntents: [makeRecentIntent({ intentId: makeIntent().intentId })],
        }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });

  test("a different payee is not a duplicate", () => {
    const decision = evaluate(
      makeInput({
        usage: makeUsage({ recentIntents: [makeRecentIntent({ payee: "other@example.com" })] }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });

  test("a different amount is not a duplicate", () => {
    const decision = evaluate(
      makeInput({ usage: makeUsage({ recentIntents: [makeRecentIntent({ amountCents: 1n })] }) }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });

  test("the 10-minute boundary is inclusive", () => {
    const boundary = evaluate(
      makeInput({
        usage: makeUsage({ recentIntents: [makeRecentIntent({ at: "2026-11-01T11:50:00.000Z" })] }),
      }),
    );
    expect(boundary.outcome).toBe("STEP_UP");

    const justOutside = evaluate(
      makeInput({
        usage: makeUsage({ recentIntents: [makeRecentIntent({ at: "2026-11-01T11:49:59.999Z" })] }),
      }),
    );
    expect(justOutside.outcome).toBe("ALLOW");
  });

  test("a future timestamp is never a duplicate", () => {
    const decision = evaluate(
      makeInput({
        usage: makeUsage({ recentIntents: [makeRecentIntent({ at: "2026-11-01T12:05:00.000Z" })] }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });

  test("payee comparison for duplicates is case-insensitive", () => {
    const decision = evaluate(
      makeInput({
        usage: makeUsage({
          recentIntents: [makeRecentIntent({ payee: "MERCH-SHOP@VENDOR.EXAMPLE" })],
        }),
      }),
    );
    expect(decision.outcome).toBe("STEP_UP");
  });

  test("a recent intent with an invalid timestamp fails closed to STEP_UP", () => {
    const decision = evaluate(
      makeInput({ usage: makeUsage({ recentIntents: [makeRecentIntent({ at: "not-a-date" })] }) }),
    );
    expect(decision.outcome).toBe("STEP_UP");
    expect(codesOf(decision)).toEqual(["POSSIBLE_DUPLICATE"]);
  });
});

describe("evaluate — check 14: ancestor limits", () => {
  test("ancestor disallows the action", () => {
    const ancestor = validAncestor({ allowedActions: ["refund"] });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(codesOf(decision)).toEqual(["PARENT_LIMIT_EXCEEDED"]);
    expect(reasonFor(decision, "PARENT_LIMIT_EXCEEDED")).toContain("action");
  });

  test("ancestor needs a payee but the intent has none", () => {
    const ancestor = validAncestor();
    const decision = evaluate(
      makeInput({ ...withAncestor(ancestor), intent: makeIntent({ payee: undefined }) }),
    );
    expect(codesOf(decision)).toContain("PARENT_LIMIT_EXCEEDED");
    expect(reasonFor(decision, "PARENT_LIMIT_EXCEEDED")).toContain("requires a payee");
  });

  test("ancestor disallows the payee", () => {
    const ancestor = validAncestor({ allowedPayees: ["only@vendor.example"] });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(codesOf(decision)).toEqual(["PARENT_LIMIT_EXCEEDED"]);
    expect(reasonFor(decision, "PARENT_LIMIT_EXCEEDED")).toContain("payee");
  });

  test("ancestor disallows the category", () => {
    const ancestor = validAncestor({ allowedCategories: ["lodging"] });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(codesOf(decision)).toEqual(["PARENT_LIMIT_EXCEEDED"]);
    expect(reasonFor(decision, "PARENT_LIMIT_EXCEEDED")).toContain("category");
  });

  test("ancestor per-tx limit is exceeded", () => {
    const ancestor = validAncestor({
      limits: { perTxMaxCents: 1_000n, dailyMaxCents: 50_000n, maxTxPerHour: 5 },
    });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(reasonFor(decision, "PARENT_LIMIT_EXCEEDED")).toContain("perTxMaxCents");
  });

  test("ancestor daily limit is exceeded", () => {
    const ancestor = validAncestor({
      limits: { perTxMaxCents: 40_000n, dailyMaxCents: 1_000n, maxTxPerHour: 5 },
    });
    const decision = evaluate(makeInput(withAncestor(ancestor)));
    expect(reasonFor(decision, "PARENT_LIMIT_EXCEEDED")).toContain("dailyMaxCents");
  });

  test("an ancestor that delegated its whole balance still backs an in-limit child payout", () => {
    const ancestor = validAncestor();
    const decision = evaluate(makeInput(withAncestor(ancestor, makeUsage({ availableCents: 0n }))));
    expect(decision).toEqual({ outcome: "ALLOW" });
  });

  test("the ancestor's own availableCents is ignored entirely", () => {
    const ancestor = validAncestor();
    const plentiful = evaluate(
      makeInput(withAncestor(ancestor, makeUsage({ availableCents: 999_999n }))),
    );
    const empty = evaluate(makeInput(withAncestor(ancestor, makeUsage({ availableCents: 0n }))));
    expect(empty).toEqual(plentiful);
    expect(empty.outcome).toBe("ALLOW");
  });

  test("a missing ancestor usage entry fails closed", () => {
    const ancestor = validAncestor();
    const decision = evaluate(makeInput({ ancestors: [ancestor], ancestorUsage: {} }));
    expect(codesOf(decision)).toEqual(["PARENT_LIMIT_EXCEEDED"]);
    expect(reasonFor(decision, "PARENT_LIMIT_EXCEEDED")).toBe(
      `usage for ancestor ${ancestor.id} missing`,
    );
  });

  test("an ancestor that does not need a payee skips the payee dimension", () => {
    const ancestor = validAncestor({
      allowedActions: ["delegate"],
      allowedPayees: ["someone@else.example"],
    });
    const decision = evaluate(
      makeInput({
        ...withAncestor(ancestor),
        leash: makeLeash({ allowedActions: ["delegate"] }),
        intent: makeIntent({
          action: "delegate",
          payee: "evil@example.com",
          amountCents: 5_000n,
          category: "merch",
        }),
      }),
    );
    expect(decision.outcome).toBe("ALLOW");
  });
});

describe("evaluate — aggregation and ordering", () => {
  test("all failures are collected in check order", () => {
    const decision = evaluate(
      makeInput({
        leash: makeLeash({
          status: "paused",
          expiresAt: "2026-11-01T00:00:00.000Z",
          allowedActions: [],
        }),
        intent: makeIntent({ amountCents: 999_999n }),
      }),
    );
    expect(codesOf(decision)).toEqual([
      "LEASH_PAUSED",
      "LEASH_EXPIRED",
      "ACTION_NOT_ALLOWED",
      "AMOUNT_EXCEEDS_PER_TX",
      "DAILY_LIMIT_EXCEEDED",
      "INSUFFICIENT_LEASH_BALANCE",
    ]);
  });

  test("a duplicate alongside another failure is a DENY that still lists it", () => {
    const decision = evaluate(
      makeInput({
        usage: makeUsage({ recentIntents: [makeRecentIntent({ amountCents: 45_000n })] }),
        intent: makeIntent({ amountCents: 45_000n }),
      }),
    );
    expect(decision.outcome).toBe("DENY");
    expect(codesOf(decision)).toEqual(["AMOUNT_EXCEEDS_PER_TX", "POSSIBLE_DUPLICATE"]);
  });
});

describe("evaluate — step-up threshold", () => {
  test("an amount above stepUpAbove yields STEP_UP", () => {
    const decision = evaluate(makeInput({ leash: makeLeash({ stepUpAboveCents: 30_000n }) }));
    expect(decision.outcome).toBe("STEP_UP");
    expect(codesOf(decision)).toEqual(["STEP_UP_REQUIRED"]);
  });

  test("an amount at stepUpAbove does not step up (strictly greater required)", () => {
    const decision = evaluate(makeInput({ leash: makeLeash({ stepUpAboveCents: 33_600n }) }));
    expect(decision.outcome).toBe("ALLOW");
  });

  test("an amount below stepUpAbove does not step up", () => {
    const decision = evaluate(makeInput({ leash: makeLeash({ stepUpAboveCents: 40_000n }) }));
    expect(decision.outcome).toBe("ALLOW");
  });

  test("step-up and duplicate are combined in one STEP_UP", () => {
    const decision = evaluate(
      makeInput({
        leash: makeLeash({ stepUpAboveCents: 30_000n }),
        usage: makeUsage({ recentIntents: [makeRecentIntent()] }),
      }),
    );
    expect(decision.outcome).toBe("STEP_UP");
    expect(codesOf(decision)).toEqual(["POSSIBLE_DUPLICATE", "STEP_UP_REQUIRED"]);
  });
});
