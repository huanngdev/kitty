import { describe, expect, test } from "bun:test";
import {
  MAX_ACTIVITY_LIMIT,
  leashActivityInputSchema,
  leashCheckInputSchema,
  leashRequestPayoutInputSchema,
  leashStatusOutputSchema,
} from "./leash-agent.schema";
import type { LeashStatusOutput } from "./leash-agent.types";

/**
 * Input/output validation of the agent MCP contracts (docs/10 §2). These are the
 * schemas the gateway registers on its tools and parses its results with, so a
 * bad call must fail here rather than reach the policy engine.
 */

const INTENT_ID = "int_01BBBBBBBBBBBBBBBBBBBBBBBB";
const LEASH_ID = "lsh_01AAAAAAAAAAAAAAAAAAAAAAAA";

describe("leash_request_payout input", () => {
  const valid = {
    intentId: INTENT_ID,
    amount: "336.00",
    payee: "merch-shop@vendor.example",
    memo: "12 hoodies",
    justification: "Channel3 product at $28 each",
  };

  test("accepts a well-formed payout request", () => {
    const parsed = leashRequestPayoutInputSchema.parse(valid);

    expect(parsed.amount).toBe("336.00");
    expect(parsed.intentId).toBe(INTENT_ID);
  });

  test("rejects a money value that is not a decimal string", () => {
    expect(leashRequestPayoutInputSchema.safeParse({ ...valid, amount: 336 }).success).toBe(false);
    expect(leashRequestPayoutInputSchema.safeParse({ ...valid, amount: "336" }).success).toBe(
      false,
    );
    expect(leashRequestPayoutInputSchema.safeParse({ ...valid, amount: "336.0" }).success).toBe(
      false,
    );
  });

  test("rejects an intentId without the int_ prefix or a valid ULID body", () => {
    expect(
      leashRequestPayoutInputSchema.safeParse({ ...valid, intentId: "int_short" }).success,
    ).toBe(false);
    expect(
      leashRequestPayoutInputSchema.safeParse({
        ...valid,
        intentId: "lsh_01JC2AAAAAAAAAAAAAAAAAAA",
      }).success,
    ).toBe(false);
  });

  test("rejects a memo longer than the payout note limit", () => {
    expect(
      leashRequestPayoutInputSchema.safeParse({ ...valid, memo: "x".repeat(166) }).success,
    ).toBe(false);
  });

  test("never accepts a leashId or agentId from the agent", () => {
    const parsed = leashRequestPayoutInputSchema.parse({ ...valid, leashId: LEASH_ID });

    expect(parsed).not.toHaveProperty("leashId");
  });
});

describe("leash_check input", () => {
  test("requires an action, a decimal amount, a memo and a justification", () => {
    expect(leashCheckInputSchema.safeParse({}).success).toBe(false);
    expect(
      leashCheckInputSchema.safeParse({
        action: "payout",
        amount: "1.00",
        memo: "ok",
        justification: "because",
      }).success,
    ).toBe(true);
  });

  test("defaults the currency to USD", () => {
    const parsed = leashCheckInputSchema.parse({
      action: "payout",
      amount: "1.00",
      memo: "ok",
      justification: "because",
    });

    expect(parsed.currency).toBe("USD");
  });
});

describe("leash_activity input", () => {
  test("defaults the limit and caps it at the documented maximum", () => {
    expect(leashActivityInputSchema.parse({}).limit).toBe(MAX_ACTIVITY_LIMIT);
    expect(leashActivityInputSchema.safeParse({ limit: MAX_ACTIVITY_LIMIT }).success).toBe(true);
    expect(leashActivityInputSchema.safeParse({ limit: MAX_ACTIVITY_LIMIT + 1 }).success).toBe(
      false,
    );
    expect(leashActivityInputSchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("leash_status output", () => {
  test("round-trips a full status payload", () => {
    const sample: LeashStatusOutput = {
      leashId: LEASH_ID,
      status: "active",
      currency: "USD",
      allocation: "500.00",
      available: "164.00",
      held: "0.00",
      spent24h: "336.00",
      limits: { perTxMax: "400.00", dailyMax: "500.00", maxTxPerHour: 5 },
      allowedActions: ["payout"],
      allowedPayees: ["merch-shop@vendor.example"],
      allowedCategories: ["merch"],
      stepUpAbove: "400.00",
      expiresAt: "2026-11-04T08:00:00Z",
    };

    expect(leashStatusOutputSchema.parse(sample)).toEqual(sample);
  });
});
