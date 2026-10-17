import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { validateDelegation } from "./delegation";
import { evaluate } from "./evaluate";
import {
  ACTIONS,
  CATEGORIES,
  type AllowedCategories,
  type Decision,
  type EvaluateInput,
  type Leash,
} from "./types";
import { isCategoryAllowed, isCategoryWildcard, isPayeeAllowed } from "./utils";
import {
  arbAcceptedDelegation,
  arbConsistentInput,
  arbDelegationPair,
  arbInput,
} from "./test-support/arbitraries";

const RUNS = 500;

const outcomeRank: Record<Decision["outcome"], number> = { ALLOW: 0, STEP_UP: 1, DENY: 2 };

function assertAllowInvariants(input: EvaluateInput): void {
  const decision = evaluate(input);
  if (decision.outcome !== "ALLOW") {
    return;
  }
  const { leash, intent, usage } = input;
  expect(leash.allowedActions).toContain(intent.action);
  expect(intent.amountCents).toBeLessThanOrEqual(leash.limits.perTxMaxCents);
  expect(intent.amountCents).toBeLessThanOrEqual(usage.availableCents);
  expect(usage.spent24hCents + intent.amountCents).toBeLessThanOrEqual(leash.limits.dailyMaxCents);
  expect(usage.allowCountLastHour).toBeLessThan(leash.limits.maxTxPerHour);
  if (intent.payee !== undefined) {
    expect(isPayeeAllowed(intent.payee, leash.allowedPayees)).toBe(true);
  }
}

describe("property: determinism", () => {
  test("the same input always yields a deep-equal decision", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const first = evaluate(input);
        const second = evaluate({
          ...input,
          leash: { ...input.leash },
          intent: { ...input.intent },
        });
        expect(second).toEqual(first);
      }),
      { numRuns: RUNS },
    );
  });

  test("evaluate never mutates the input", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const snapshot = { ...input, intent: { ...input.intent } };
        evaluate(input);
        expect(input.intent).toEqual(snapshot.intent);
        expect(input.leash).toEqual(snapshot.leash);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("property: justification independence", () => {
  test("changing intent.justification never changes the decision", () => {
    fc.assert(
      fc.property(arbInput, fc.string(), (input, justification) => {
        const baseline = evaluate(input);
        const mutated = evaluate({ ...input, intent: { ...input.intent, justification } });
        expect(mutated).toEqual(baseline);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("property: ALLOW implies the limits hold", () => {
  test("every random ALLOW satisfies the numeric and allow-list limits", () => {
    fc.assert(fc.property(arbInput, assertAllowInvariants), { numRuns: RUNS });
  });

  test("a consistent input always yields ALLOW", () => {
    fc.assert(
      fc.property(arbConsistentInput, (input) => {
        expect(evaluate(input).outcome).toBe("ALLOW");
        assertAllowInvariants(input);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("property: ancestor balance is irrelevant", () => {
  test("changing an ancestor's availableCents never changes the decision", () => {
    fc.assert(
      fc.property(arbInput, fc.bigInt({ min: 0n, max: 1_000_000n }), (input, availableCents) => {
        const baseline = evaluate(input);
        const mutated: EvaluateInput = {
          ...input,
          ancestorUsage: Object.fromEntries(
            Object.entries(input.ancestorUsage).map(
              ([id, usage]) => [id, { ...usage, availableCents }] as const,
            ),
          ),
        };
        expect(evaluate(mutated)).toEqual(baseline);
      }),
      { numRuns: RUNS },
    );
  });
});

const scaleDown = (value: bigint, factor: number): bigint => (value * BigInt(factor)) / 1000n;

function tightenCategories(
  allowed: AllowedCategories,
  keep: number,
  empty: boolean,
): AllowedCategories {
  if (isCategoryWildcard(allowed)) {
    return empty ? [] : allowed;
  }
  return allowed.slice(0, keep);
}

const arbTightening: fc.Arbitrary<{ original: EvaluateInput; tightened: EvaluateInput }> = fc
  .record({
    input: arbInput,
    perTxFactor: fc.nat({ max: 1000 }),
    dailyFactor: fc.nat({ max: 1000 }),
    rateKeep: fc.nat({ max: 8 }),
    availableFactor: fc.nat({ max: 1000 }),
    actionsKeep: fc.nat({ max: ACTIONS.length }),
    payeesKeep: fc.nat({ max: 4 }),
    categoriesKeep: fc.nat({ max: CATEGORIES.length }),
    categoriesEmpty: fc.boolean(),
    stepSeed: fc.nat({ max: 1000 }),
    addStepUp: fc.boolean(),
  })
  .map(
    ({
      input,
      perTxFactor,
      dailyFactor,
      rateKeep,
      availableFactor,
      actionsKeep,
      payeesKeep,
      categoriesKeep,
      categoriesEmpty,
      stepSeed,
      addStepUp,
    }) => {
      const leash = input.leash;
      const stepUpAboveCents =
        leash.stepUpAboveCents === null
          ? addStepUp
            ? BigInt(stepSeed)
            : null
          : scaleDown(leash.stepUpAboveCents, stepSeed);
      const tightenedLeash: Leash = {
        ...leash,
        limits: {
          perTxMaxCents: scaleDown(leash.limits.perTxMaxCents, perTxFactor),
          dailyMaxCents: scaleDown(leash.limits.dailyMaxCents, dailyFactor),
          maxTxPerHour: Math.min(leash.limits.maxTxPerHour, rateKeep),
        },
        allowedActions: leash.allowedActions.slice(0, actionsKeep),
        allowedPayees: leash.allowedPayees.slice(0, payeesKeep),
        allowedCategories: tightenCategories(
          leash.allowedCategories,
          categoriesKeep,
          categoriesEmpty,
        ),
        stepUpAboveCents,
      };
      const tightened: EvaluateInput = {
        ...input,
        leash: tightenedLeash,
        usage: {
          ...input.usage,
          availableCents: scaleDown(input.usage.availableCents, availableFactor),
        },
      };
      return { original: input, tightened };
    },
  );

describe("property: monotonicity", () => {
  test("tightening a leash never turns DENY into ALLOW or STEP_UP", () => {
    fc.assert(
      fc.property(arbTightening, ({ original, tightened }) => {
        const before = outcomeRank[evaluate(original).outcome];
        const after = outcomeRank[evaluate(tightened).outcome];
        expect(after).toBeGreaterThanOrEqual(before);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("property: delegation only narrows", () => {
  function assertNotBroader(
    parent: Leash,
    child: Leash,
    parentUsage: EvaluateInput["usage"],
  ): void {
    expect(child.allocationCents).toBeLessThanOrEqual(parentUsage.availableCents);
    expect(child.limits.perTxMaxCents).toBeLessThanOrEqual(parent.limits.perTxMaxCents);
    expect(child.limits.dailyMaxCents).toBeLessThanOrEqual(parent.limits.dailyMaxCents);
    expect(child.limits.maxTxPerHour).toBeLessThanOrEqual(parent.limits.maxTxPerHour);
    expect(Date.parse(child.expiresAt)).toBeLessThanOrEqual(Date.parse(parent.expiresAt));
    for (const action of child.allowedActions) {
      expect(parent.allowedActions).toContain(action);
    }
    expect(child.allowedActions).not.toContain("delegate");
    for (const payee of child.allowedPayees) {
      expect(isPayeeAllowed(payee, parent.allowedPayees)).toBe(true);
    }
    if (!isCategoryWildcard(parent.allowedCategories)) {
      expect(isCategoryWildcard(child.allowedCategories)).toBe(false);
      if (!isCategoryWildcard(child.allowedCategories)) {
        for (const category of child.allowedCategories) {
          expect(isCategoryAllowed(category, parent.allowedCategories)).toBe(true);
        }
      }
    }
    if (parent.stepUpAboveCents !== null) {
      const childThreshold = child.stepUpAboveCents;
      expect(childThreshold).not.toBeNull();
      if (childThreshold !== null) {
        expect(childThreshold).toBeLessThanOrEqual(parent.stepUpAboveCents);
      }
    }
  }

  test("a narrowing child is always accepted and never broader", () => {
    fc.assert(
      fc.property(arbAcceptedDelegation, ({ parent, child, parentUsage }) => {
        const result = validateDelegation(parent, child, parentUsage);
        expect(result.ok).toBe(true);
        assertNotBroader(parent, child, parentUsage);
      }),
      { numRuns: RUNS },
    );
  });

  test("any accepted random pair is never broader than its parent", () => {
    fc.assert(
      fc.property(arbDelegationPair, ({ parent, child, parentUsage }) => {
        const result = validateDelegation(parent, child, parentUsage);
        if (!result.ok) {
          return;
        }
        assertNotBroader(parent, child, parentUsage);
      }),
      { numRuns: RUNS },
    );
  });
});
