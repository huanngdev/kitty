import { describe, expect, test } from "bun:test";

import { validateDelegation } from "../src/delegation";
import type { DelegationResult } from "../src/delegation";
import type { Leash } from "../src/types";
import { makeLeash, makeUsage } from "./support/factories";

const PARENT_ID = "lsh_01PARENTPARENTPARENTPARENTPAR";
const CHILD_ID = "lsh_01CHILDCHILDCHILDCHILDCHILD";

function parent(overrides: Partial<Leash> = {}): Leash {
  return makeLeash({
    id: PARENT_ID,
    parentId: null,
    limits: { perTxMaxCents: 40_000n, dailyMaxCents: 50_000n, maxTxPerHour: 5 },
    stepUpAboveCents: null,
    expiresAt: "2026-11-10T00:00:00.000Z",
    ...overrides,
  });
}

function child(parentLeash: Leash, overrides: Partial<Leash> = {}): Leash {
  return makeLeash({
    id: CHILD_ID,
    parentId: parentLeash.id,
    allocationCents: 20_000n,
    limits: { perTxMaxCents: 30_000n, dailyMaxCents: 40_000n, maxTxPerHour: 3 },
    allowedActions: ["payout"],
    allowedPayees: ["merch-shop@vendor.example"],
    allowedCategories: ["merch"],
    stepUpAboveCents: null,
    expiresAt: "2026-11-05T00:00:00.000Z",
    ...overrides,
  });
}

function details(result: DelegationResult): string[] {
  return result.ok ? [] : result.reasons.map((reason) => reason.detail);
}

describe("validateDelegation", () => {
  test("accepts a child that is a narrowing of the parent", () => {
    const p = parent();
    expect(validateDelegation(p, child(p), makeUsage({ availableCents: 50_000n }))).toEqual({
      ok: true,
      reasons: [],
    });
  });

  test("accepts a child that never steps up when the parent has no threshold", () => {
    const p = parent({ stepUpAboveCents: null });
    const result = validateDelegation(
      p,
      child(p, { stepUpAboveCents: null }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(result.ok).toBe(true);
  });

  test("ALLOCATION: the child cannot exceed the parent's available balance", () => {
    const p = parent();
    const result = validateDelegation(
      p,
      child(p, { allocationCents: 60_000n }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["ALLOCATION"]);
  });

  test("PER_TX, DAILY and RATE: the child cannot exceed any parent limit", () => {
    const p = parent();
    const result = validateDelegation(
      p,
      child(p, { limits: { perTxMaxCents: 50_000n, dailyMaxCents: 60_000n, maxTxPerHour: 6 } }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["PER_TX", "DAILY", "RATE"]);
  });

  test("ACTIONS: the child cannot add actions the parent lacks", () => {
    const p = parent();
    const result = validateDelegation(
      p,
      child(p, { allowedActions: ["payout", "refund"] }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["ACTIONS"]);
  });

  test("DELEGATE_NOT_ALLOWED: the child may never delegate further", () => {
    const p = parent({ allowedActions: ["payout", "delegate"] });
    const result = validateDelegation(
      p,
      child(p, { allowedActions: ["payout", "delegate"] }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["DELEGATE_NOT_ALLOWED"]);
  });

  test("a child subset that drops delegate is accepted", () => {
    const p = parent({ allowedActions: ["payout", "delegate"] });
    const result = validateDelegation(
      p,
      child(p, { allowedActions: ["payout"] }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(result.ok).toBe(true);
  });

  test("PAYEES: the child cannot add payees the parent lacks", () => {
    const p = parent();
    const result = validateDelegation(
      p,
      child(p, { allowedPayees: ["other@vendor.example"] }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["PAYEES"]);
  });

  test("PAYEES: member:* narrows correctly", () => {
    const p = parent({ allowedPayees: ["member:*"] });
    expect(
      validateDelegation(
        p,
        child(p, { allowedPayees: ["member:mem_01A"] }),
        makeUsage({ availableCents: 50_000n }),
      ).ok,
    ).toBe(true);
    expect(
      validateDelegation(
        p,
        child(p, { allowedPayees: ["member:*"] }),
        makeUsage({ availableCents: 50_000n }),
      ).ok,
    ).toBe(true);
  });

  test("PAYEES: a child member:* is broader than a concrete parent payee", () => {
    const p = parent({ allowedPayees: ["member:mem_01A"] });
    const result = validateDelegation(
      p,
      child(p, { allowedPayees: ["member:*"] }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["PAYEES"]);
  });

  test("CATEGORIES: a child wildcard is broader than a restricted parent", () => {
    const p = parent({ allowedCategories: ["merch"] });
    const result = validateDelegation(
      p,
      child(p, { allowedCategories: ["*"] }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["CATEGORIES"]);
  });

  test("CATEGORIES: the child cannot add categories the parent lacks", () => {
    const p = parent({ allowedCategories: ["merch"] });
    const result = validateDelegation(
      p,
      child(p, { allowedCategories: ["merch", "food"] }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["CATEGORIES"]);
  });

  test("CATEGORIES: a wildcard parent accepts any child categories", () => {
    const p = parent({ allowedCategories: ["*"] });
    expect(
      validateDelegation(
        p,
        child(p, { allowedCategories: ["merch"] }),
        makeUsage({ availableCents: 50_000n }),
      ).ok,
    ).toBe(true);
    expect(
      validateDelegation(
        p,
        child(p, { allowedCategories: ["*"] }),
        makeUsage({ availableCents: 50_000n }),
      ).ok,
    ).toBe(true);
  });

  test("EXPIRY: the child cannot outlive the parent", () => {
    const p = parent({ expiresAt: "2026-11-05T00:00:00.000Z" });
    const result = validateDelegation(
      p,
      child(p, { expiresAt: "2026-11-06T00:00:00.000Z" }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["EXPIRY"]);
  });

  test("EXPIRY: a malformed child expiresAt fails closed", () => {
    const p = parent();
    const result = validateDelegation(
      p,
      child(p, { expiresAt: "not-a-date" }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["EXPIRY"]);
  });

  test("EXPIRY: a malformed parent expiresAt fails closed", () => {
    const p = parent({ expiresAt: "" });
    const result = validateDelegation(p, child(p), makeUsage({ availableCents: 50_000n }));
    expect(details(result)).toEqual(["EXPIRY"]);
  });

  test("STEP_UP: a child with no threshold is broader than a parent threshold", () => {
    const p = parent({ stepUpAboveCents: 30_000n });
    const result = validateDelegation(
      p,
      child(p, { stepUpAboveCents: null }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["STEP_UP"]);
  });

  test("STEP_UP: a child threshold above the parent's is a violation", () => {
    const p = parent({ stepUpAboveCents: 30_000n });
    const result = validateDelegation(
      p,
      child(p, { stepUpAboveCents: 40_000n }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(details(result)).toEqual(["STEP_UP"]);
  });

  test("STEP_UP: a child threshold at or below the parent's is accepted", () => {
    const p = parent({ stepUpAboveCents: 30_000n });
    expect(
      validateDelegation(
        p,
        child(p, { stepUpAboveCents: 30_000n }),
        makeUsage({ availableCents: 50_000n }),
      ).ok,
    ).toBe(true);
    expect(
      validateDelegation(
        p,
        child(p, { stepUpAboveCents: 10_000n }),
        makeUsage({ availableCents: 50_000n }),
      ).ok,
    ).toBe(true);
  });

  test("DEPTH: the parent must itself be a root leash", () => {
    const p = parent({ parentId: "lsh_01GRANDPARENTGRANDPARENTGR" });
    const result = validateDelegation(p, child(p), makeUsage({ availableCents: 50_000n }));
    expect(details(result)).toEqual(["DEPTH"]);
  });

  test("all violations are collected together", () => {
    const p = parent({ allowedActions: ["payout"], stepUpAboveCents: 30_000n });
    const result = validateDelegation(
      p,
      child(p, {
        allocationCents: 90_000n,
        limits: { perTxMaxCents: 90_000n, dailyMaxCents: 90_000n, maxTxPerHour: 9 },
        allowedActions: ["payout", "refund", "delegate"],
        allowedPayees: ["other@vendor.example"],
        allowedCategories: ["*"],
        stepUpAboveCents: 90_000n,
        expiresAt: "2026-12-01T00:00:00.000Z",
      }),
      makeUsage({ availableCents: 50_000n }),
    );
    expect(result.ok).toBe(false);
    expect(details(result)).toEqual([
      "ALLOCATION",
      "PER_TX",
      "DAILY",
      "RATE",
      "ACTIONS",
      "DELEGATE_NOT_ALLOWED",
      "PAYEES",
      "CATEGORIES",
      "EXPIRY",
      "STEP_UP",
    ]);
  });
});
