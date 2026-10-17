import { describe, expect, test } from "bun:test";

import { DELEGATION_DETAIL_MESSAGES, REASON_MESSAGES } from "../src/reasons";

const EXPECTED_REASON_CODES = [
  "LEASH_NOT_ACTIVE",
  "LEASH_REVOKED",
  "LEASH_PAUSED",
  "LEASH_EXHAUSTED",
  "LEASH_EXPIRED",
  "LEASH_NOT_YET_VALID",
  "PARENT_LEASH_INACTIVE",
  "CURRENCY_MISMATCH",
  "ACTION_NOT_ALLOWED",
  "PAYEE_NOT_ALLOWED",
  "CATEGORY_NOT_ALLOWED",
  "INVALID_AMOUNT",
  "AMOUNT_EXCEEDS_PER_TX",
  "DAILY_LIMIT_EXCEEDED",
  "INSUFFICIENT_LEASH_BALANCE",
  "RATE_LIMITED",
  "POSSIBLE_DUPLICATE",
  "PARENT_LIMIT_EXCEEDED",
  "DELEGATION_EXCEEDS_PARENT",
  "STEP_UP_REQUIRED",
] as const;

describe("reason code messages", () => {
  test("the code set is exactly the documented one and every message is non-empty", () => {
    expect(Object.keys(REASON_MESSAGES).sort()).toEqual([...EXPECTED_REASON_CODES].sort());
    for (const message of Object.values(REASON_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });

  test("key messages match docs/15 copy intent", () => {
    expect(REASON_MESSAGES.PAYEE_NOT_ALLOWED).toBe(
      "The payee is not on this leash's approved payees.",
    );
    expect(REASON_MESSAGES.POSSIBLE_DUPLICATE).toContain("step-up approval");
    expect(REASON_MESSAGES.DELEGATION_EXCEEDS_PARENT).toContain("sub-leash");
  });

  test("every delegation detail code has a non-empty message", () => {
    for (const message of Object.values(DELEGATION_DETAIL_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
    expect(Object.keys(DELEGATION_DETAIL_MESSAGES).sort()).toEqual(
      [
        "ACTIONS",
        "ALLOCATION",
        "CATEGORIES",
        "DAILY",
        "DELEGATE_NOT_ALLOWED",
        "DEPTH",
        "EXPIRY",
        "PAYEES",
        "PER_TX",
        "RATE",
        "STEP_UP",
      ].sort(),
    );
  });
});
