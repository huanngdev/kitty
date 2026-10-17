import { describe, expect, test } from "bun:test";

import { ACTIONS, type Action } from "../src/types";
import {
  DUPLICATE_WINDOW_MS,
  MEMBER_WILDCARD,
  actionNeedsPayee,
  isCategoryAllowed,
  isCategoryWildcard,
  isMoneyAction,
  isPayeeAllowed,
  isZeroAmountAction,
  normalizePayee,
} from "../src/utils";

describe("constants", () => {
  test("the duplicate window is ten minutes", () => {
    expect(DUPLICATE_WINDOW_MS).toBe(10 * 60 * 1000);
    expect(MEMBER_WILDCARD).toBe("member:*");
  });
});

describe("action classification", () => {
  test("isMoneyAction is true exactly for the five money actions", () => {
    const money: readonly Action[] = [
      "payout",
      "create_invoice",
      "create_order",
      "refund",
      "delegate",
    ];
    const zeroAmount: readonly Action[] = ["send_reminder", "browser_booking"];

    for (const action of money) {
      expect(isMoneyAction(action)).toBe(true);
      expect(isZeroAmountAction(action)).toBe(false);
    }
    for (const action of zeroAmount) {
      expect(isMoneyAction(action)).toBe(false);
      expect(isZeroAmountAction(action)).toBe(true);
    }
    // Every action is in exactly one bucket.
    for (const action of ACTIONS) {
      expect(isMoneyAction(action) !== isZeroAmountAction(action)).toBe(true);
    }
  });

  test("actionNeedsPayee is true for payout, refund and create_invoice", () => {
    expect(actionNeedsPayee("payout")).toBe(true);
    expect(actionNeedsPayee("refund")).toBe(true);
    expect(actionNeedsPayee("create_invoice")).toBe(true);
    expect(actionNeedsPayee("create_order")).toBe(false);
    expect(actionNeedsPayee("delegate")).toBe(false);
    expect(actionNeedsPayee("send_reminder")).toBe(false);
    expect(actionNeedsPayee("browser_booking")).toBe(false);
  });
});

describe("normalizePayee", () => {
  test("trims and lowercases", () => {
    expect(normalizePayee("  Vendor@Example.COM ")).toBe("vendor@example.com");
    expect(normalizePayee(MEMBER_WILDCARD)).toBe(MEMBER_WILDCARD);
  });
});

describe("isPayeeAllowed", () => {
  test("matches case-insensitively", () => {
    expect(isPayeeAllowed("Vendor@Example.com", ["vendor@example.com"])).toBe(true);
    expect(isPayeeAllowed("vendor@example.com", ["VENDOR@EXAMPLE.COM"])).toBe(true);
  });

  test("member:* matches any member:<id>", () => {
    expect(isPayeeAllowed("member:mem_01ABC", [MEMBER_WILDCARD])).toBe(true);
    expect(isPayeeAllowed(MEMBER_WILDCARD, [MEMBER_WILDCARD])).toBe(true);
    expect(isPayeeAllowed("  MEMBER:mem_01ABC ", [MEMBER_WILDCARD])).toBe(true);
  });

  test("does not match unrelated payees or literals", () => {
    expect(isPayeeAllowed("other@vendor.example", [MEMBER_WILDCARD])).toBe(false);
    expect(isPayeeAllowed("member:mem_01ABC", ["vendor@example.com"])).toBe(false);
    expect(isPayeeAllowed("vendor@example.com", [])).toBe(false);
  });

  test("member:* is only special when it is the allow-list entry", () => {
    // A concrete payee string "member:x" is not a wildcard in the allow-list.
    expect(isPayeeAllowed("member:y", ["member:x"])).toBe(false);
    expect(isPayeeAllowed("member:x", ["member:x"])).toBe(true);
  });
});

describe("categories", () => {
  test("isCategoryWildcard recognises only the singular wildcard", () => {
    expect(isCategoryWildcard(["*"])).toBe(true);
    expect(isCategoryWildcard(["merch"])).toBe(false);
    expect(isCategoryWildcard([])).toBe(false);
    expect(isCategoryWildcard(["merch", "gear"])).toBe(false);
  });

  test("isCategoryAllowed honours the wildcard and concrete lists", () => {
    expect(isCategoryAllowed("lodging", ["*"])).toBe(true);
    expect(isCategoryAllowed("merch", ["merch", "gear"])).toBe(true);
    expect(isCategoryAllowed("food", ["merch", "gear"])).toBe(false);
    expect(isCategoryAllowed("food", [])).toBe(false);
  });
});
