import { describe, expect, test } from "bun:test";
import type { CreateLeashInput } from "@kitty/shared/leash-admin";
import { AppError } from "../../../src/lib/errors";
import {
  assertLeashTransition,
  resolveAllowedPayees,
  validateCreateLeashSpec,
  validateTopupAmount,
} from "../../../src/modules/leashes/leashes.validation";
import type { ValidateCreateLeashContext } from "../../../src/modules/leashes/leashes.validation";

const now = new Date("2026-06-01T00:00:00.000Z");

function baseInput(overrides: Partial<CreateLeashInput> = {}): CreateLeashInput {
  return {
    kittyId: "kty_01JZZZZZZZZZZZZZZZZZZZZZZZ",
    agentId: "agt_01JZZZZZZZZZZZZZZZZZZZZZZZ",
    allocation: "2500.00",
    limits: { perTxMax: "1200.00", dailyMax: "2000.00", maxTxPerHour: 6 },
    allowedActions: ["payout", "refund"],
    allowedPayees: ["homestay@vendor.example"],
    allowedCategories: ["lodging"],
    stepUpAbove: "500.00",
    expiresAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}

function baseContext(
  overrides: Partial<ValidateCreateLeashContext> = {},
): ValidateCreateLeashContext {
  return {
    kittyAvailableCents: 1_000_000n,
    verifiedPayees: ["homestay@vendor.example"],
    hasActiveLeashForAgent: false,
    now,
    ...overrides,
  };
}

/** Runs `fn` and returns the `AppError` code it threw. */
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) {
      return error.code;
    }

    throw error;
  }

  throw new Error("expected the call to throw");
}

describe("validateCreateLeashSpec", () => {
  test("parses a valid request into cents", () => {
    const spec = validateCreateLeashSpec(baseInput(), baseContext());

    expect(spec.allocationCents).toBe(250_000n);
    expect(spec.perTxMaxCents).toBe(120_000n);
    expect(spec.dailyMaxCents).toBe(200_000n);
    expect(spec.stepUpAboveCents).toBe(50_000n);
    expect(spec.notBefore).toEqual(now);
    expect(spec.allowedPayees).toEqual(["homestay@vendor.example"]);
  });

  test("rejects an allocation above the kitty available balance", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(
          baseInput({ allocation: "3000.00" }),
          baseContext({ kittyAvailableCents: 100_000n }),
        ),
      ),
    ).toBe("ALLOCATION_EXCEEDS_KITTY_AVAILABLE");
  });

  test("rejects per-tx above the allocation", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(
          baseInput({ limits: { perTxMax: "3000.00", dailyMax: "2000.00", maxTxPerHour: 6 } }),
          baseContext({ kittyAvailableCents: 1_000_000n }),
        ),
      ),
    ).toBe("INVALID_LEASH_LIMITS");
  });

  test("rejects daily max above the allocation", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(
          baseInput({ limits: { perTxMax: "1200.00", dailyMax: "3000.00", maxTxPerHour: 6 } }),
          baseContext({ kittyAvailableCents: 1_000_000n }),
        ),
      ),
    ).toBe("INVALID_LEASH_LIMITS");
  });

  test("allows a zero-allocation leash with non-zero limits (Collector)", () => {
    const spec = validateCreateLeashSpec(
      baseInput({
        allocation: "0.00",
        limits: { perTxMax: "50.00", dailyMax: "0.00", maxTxPerHour: 10 },
        allowedActions: ["create_invoice"],
        allowedPayees: ["member:*"],
        stepUpAbove: null,
      }),
      baseContext(),
    );

    expect(spec.allocationCents).toBe(0n);
    expect(spec.perTxMaxCents).toBe(5000n);
  });

  test("rejects step-up above per-tx", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(
          baseInput({ stepUpAbove: "1500.00" }),
          baseContext({ kittyAvailableCents: 1_000_000n }),
        ),
      ),
    ).toBe("INVALID_LEASH_LIMITS");
  });

  test("rejects an expiry beyond 30 days", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(
          baseInput({ expiresAt: "2026-08-01T00:00:00.000Z" }),
          baseContext(),
        ),
      ),
    ).toBe("EXPIRY_TOO_LONG");
  });

  test("rejects an expiry in the past", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(
          baseInput({ expiresAt: "2026-05-01T00:00:00.000Z" }),
          baseContext(),
        ),
      ),
    ).toBe("INVALID_EXPIRY");
  });

  test("rejects an unverified payee", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(
          baseInput({ allowedPayees: ["unknown@vendor.example"] }),
          baseContext(),
        ),
      ),
    ).toBe("PAYEE_NOT_VERIFIED");
  });

  test("accepts a verified payee regardless of case", () => {
    const spec = validateCreateLeashSpec(
      baseInput({ allowedPayees: ["Homestay@Vendor.Example"] }),
      baseContext(),
    );

    expect(spec.allowedPayees).toEqual(["homestay@vendor.example"]);
  });

  test("rejects member:* combined with a vendor-paying action", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(
          baseInput({ allowedPayees: ["member:*"], allowedActions: ["payout"] }),
          baseContext(),
        ),
      ),
    ).toBe("BAD_REQUEST");
  });

  test("accepts member:* for create_invoice / refund", () => {
    const spec = validateCreateLeashSpec(
      baseInput({
        allowedPayees: ["member:*"],
        allowedActions: ["create_invoice", "refund"],
      }),
      baseContext(),
    );

    expect(spec.allowedPayees).toEqual(["member:*"]);
  });

  test("rejects a second active leash for the same agent", () => {
    expect(
      codeOf(() =>
        validateCreateLeashSpec(baseInput(), baseContext({ hasActiveLeashForAgent: true })),
      ),
    ).toBe("AGENT_ALREADY_LEASHED");
  });
});

describe("resolveAllowedPayees", () => {
  test("keeps member:* and lowercases emails", () => {
    expect(
      resolveAllowedPayees([" MEMBER:* ", "Vendor@Example.com"], [], ["vendor@example.com"]),
    ).toEqual(["member:*", "vendor@example.com"]);
  });
});

describe("validateTopupAmount", () => {
  test("rejects a non-positive amount", () => {
    expect(codeOf(() => validateTopupAmount("0.00", 10_000n))).toBe("BAD_REQUEST");
  });

  test("rejects an amount above kitty available", () => {
    expect(codeOf(() => validateTopupAmount("200.00", 10_000n))).toBe(
      "ALLOCATION_EXCEEDS_KITTY_AVAILABLE",
    );
  });

  test("returns cents for a valid amount", () => {
    expect(validateTopupAmount("50.00", 10_000n)).toBe(5000n);
  });
});

describe("assertLeashTransition", () => {
  test("allows pause from active and resume from paused", () => {
    expect(() => assertLeashTransition("active", "pause")).not.toThrow();
    expect(() => assertLeashTransition("paused", "resume")).not.toThrow();
  });

  test("allows top-up from exhausted", () => {
    expect(() => assertLeashTransition("exhausted", "topup")).not.toThrow();
  });

  test("rejects pausing a paused leash", () => {
    expect(codeOf(() => assertLeashTransition("paused", "pause"))).toBe("INVALID_STATE_TRANSITION");
  });

  test("rejects revoking a revoked leash", () => {
    expect(codeOf(() => assertLeashTransition("revoked", "revoke"))).toBe(
      "INVALID_STATE_TRANSITION",
    );
  });
});
