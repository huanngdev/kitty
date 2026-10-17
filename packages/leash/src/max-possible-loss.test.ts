import { describe, expect, test } from "bun:test";

import { maxPossibleLoss } from "./max-possible-loss";
import type { Leash } from "./types";
import { makeBalance, makeLeash } from "./test-support/factories";

function leash(id: string, status: Leash["status"]): Leash {
  return makeLeash({ id, status });
}

describe("maxPossibleLoss", () => {
  test("sums available and held across active leashes", () => {
    const leashes = [leash("lsh_a", "active"), leash("lsh_b", "active")];
    const total = maxPossibleLoss(leashes, {
      lsh_a: makeBalance({ availableCents: 10_000n, heldCents: 2_000n }),
      lsh_b: makeBalance({ availableCents: 5_000n, heldCents: 1_000n }),
    });
    expect(total).toBe(18_000n);
  });

  test("ignores leashes that are not active", () => {
    const leashes = [leash("lsh_a", "active"), leash("lsh_b", "revoked")];
    const total = maxPossibleLoss(leashes, {
      lsh_a: makeBalance({ availableCents: 10_000n, heldCents: 0n }),
      lsh_b: makeBalance({ availableCents: 999_999n, heldCents: 999_999n }),
    });
    expect(total).toBe(10_000n);
  });

  test("treats a missing balance as zero", () => {
    const total = maxPossibleLoss([leash("lsh_a", "active")], {});
    expect(total).toBe(0n);
  });

  test("returns 0n for an empty fleet", () => {
    expect(maxPossibleLoss([], {})).toBe(0n);
  });
});
