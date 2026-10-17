import fc from "fast-check";

import {
  ACTIONS,
  CATEGORIES,
  LEASH_STATUSES,
  type Action,
  type AllowedCategories,
  type Category,
  type EvaluateInput,
  type Leash,
  type LeashStatus,
  type RecentIntent,
  type SpendIntent,
  type Usage,
} from "../types";
import { isCategoryWildcard, isMoneyAction } from "../utils";

export const NOW = "2026-11-01T12:00:00.000Z";

const LEASH_ID = "lsh_01AAAAAAAAAAAAAAAAAAAAAAAA";
const PARENT_ID = "lsh_01PPPPPPPPPPPPPPPPPPPPPPPP";

const INSTANTS = [
  "2026-10-20T00:00:00.000Z",
  "2026-11-01T00:00:00.000Z",
  "2026-11-01T12:00:00.000Z",
  "2026-11-05T00:00:00.000Z",
  "2026-11-20T00:00:00.000Z",
] as const;

const arbCents = fc.bigInt({ min: 0n, max: 500_000n });
const arbAction: fc.Arbitrary<Action> = fc.constantFrom(...ACTIONS);
const arbCategory: fc.Arbitrary<Category> = fc.constantFrom(...CATEGORIES);
const arbStatus: fc.Arbitrary<LeashStatus> = fc.constantFrom(...LEASH_STATUSES);
const arbInstant = fc.constantFrom(...INSTANTS);
const arbPayee = fc.constantFrom(
  "merch-shop@vendor.example",
  "MEMBER:MEM_01AAAA",
  "member:mem_01bbbb",
  "other@vendor.example",
);

const arbWindow = fc
  .tuple(arbInstant, arbInstant)
  .map(([a, b]) =>
    a <= b ? ({ notBefore: a, expiresAt: b } as const) : ({ notBefore: b, expiresAt: a } as const),
  );

const arbAllowedCategories: fc.Arbitrary<AllowedCategories> = fc.oneof(
  fc.uniqueArray(arbCategory, { maxLength: CATEGORIES.length }),
  fc.constant(["*"] as const),
);

const arbRandomLeash: fc.Arbitrary<Leash> = fc
  .record({
    allocationCents: arbCents,
    parentId: fc.option(fc.constant(PARENT_ID), { nil: null }),
    limits: fc.record({
      perTxMaxCents: arbCents,
      dailyMaxCents: arbCents,
      maxTxPerHour: fc.nat({ max: 8 }),
    }),
    allowedActions: fc.uniqueArray(arbAction, { maxLength: ACTIONS.length }),
    allowedPayees: fc.uniqueArray(arbPayee, { maxLength: 4 }),
    allowedCategories: arbAllowedCategories,
    stepUpAboveCents: fc.option(arbCents, { nil: null }),
    status: arbStatus,
    window: arbWindow,
  })
  .map(({ window, ...rest }) => ({
    id: LEASH_ID,
    kittyId: "kty_01AAAAAAAAAAAAAAAAAAAAAAAA",
    agentId: "agt_01AAAAAAAAAAAAAAAAAAAAAAAA",
    agentPublicKey: "cHVibGlja2V5LWJhc2U2NHVybA",
    currency: "USD" as const,
    createdBy: "user_01AAAAAAAAAAAAAAAAAAAAAAAA",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...rest,
    notBefore: window.notBefore,
    expiresAt: window.expiresAt,
  }));

const arbRandomIntent: fc.Arbitrary<SpendIntent> = fc.record({
  intentId: fc.constantFrom("int_01EEEEEEEEEEEEEEEEEEEE", "int_01FFFFFFFFFFFFFFFFFFFF"),
  action: arbAction,
  amountCents: arbCents,
  currency: fc.constant("USD" as const),
  payee: fc.option(arbPayee, { nil: undefined }),
  category: fc.option(arbCategory, { nil: undefined }),
  memo: fc.constant("memo"),
  taskId: fc.option(fc.constant("tsk_01AAAAAAAAAAAAAAAAAAAAAAAA"), { nil: undefined }),
  justification: fc.string(),
});

const arbRecentIntent: fc.Arbitrary<RecentIntent> = fc.record({
  intentId: fc.constantFrom("int_01XXXXXXXXXXXXXXXXXXXXXX", "int_01YYYYYYYYYYYYYYYYYYYYYY"),
  payee: arbPayee,
  amountCents: arbCents,
  at: arbInstant,
});

const arbUsage: fc.Arbitrary<Usage> = fc.record({
  availableCents: arbCents,
  spent24hCents: arbCents,
  allowCountLastHour: fc.nat({ max: 12 }),
  recentIntents: fc.array(arbRecentIntent, { maxLength: 3 }),
});

const arbAncestorUsage: fc.Arbitrary<Readonly<Record<string, Usage>>> = fc
  .array(fc.tuple(fc.constant(LEASH_ID), arbUsage), { maxLength: 1 })
  .map((entries) => Object.fromEntries(entries));

/** Fully random input — used for determinism and monotonicity properties. */
export const arbInput: fc.Arbitrary<EvaluateInput> = fc.record({
  leash: arbRandomLeash,
  ancestors: fc.array(arbRandomLeash, { maxLength: 2 }),
  intent: arbRandomIntent,
  usage: arbUsage,
  ancestorUsage: arbAncestorUsage,
  now: arbInstant,
});

/**
 * Input built so the engine must return ALLOW: every limit is set just above
 * the requested amount and every allow-list contains the intent's values.
 */
export const arbConsistentInput: fc.Arbitrary<EvaluateInput> = fc
  .record({
    action: arbAction,
    amountSeed: fc.bigInt({ min: 0n, max: 100_000n }),
    spentSeed: fc.bigInt({ min: 0n, max: 100_000n }),
    countSeed: fc.nat({ max: 5 }),
    payee: arbPayee,
    category: arbCategory,
    withAncestor: fc.boolean(),
    withRecent: fc.boolean(),
    justification: fc.string(),
  })
  .map(
    ({
      action,
      amountSeed,
      spentSeed,
      countSeed,
      payee,
      category,
      withAncestor,
      withRecent,
      justification,
    }) => {
      const amountCents = isMoneyAction(action) ? (amountSeed === 0n ? 1n : amountSeed) : 0n;
      const account = {
        availableCents: amountCents + 1_000n,
        spent24hCents: spentSeed,
        allowCountLastHour: countSeed,
        recentIntents: [] as RecentIntent[],
      };
      const limits = {
        perTxMaxCents: amountCents + 100n,
        dailyMaxCents: spentSeed + amountCents + 100n,
        maxTxPerHour: countSeed + 1,
      };
      const base: Leash = {
        id: LEASH_ID,
        kittyId: "kty_01AAAAAAAAAAAAAAAAAAAAAAAA",
        parentId: null,
        agentId: "agt_01AAAAAAAAAAAAAAAAAAAAAAAA",
        agentPublicKey: "cHVibGlja2V5LWJhc2U2NHVybA",
        currency: "USD",
        allocationCents: amountCents,
        limits,
        allowedActions: [action],
        allowedPayees: [payee],
        allowedCategories: [category],
        stepUpAboveCents: null,
        notBefore: "2026-11-01T00:00:00.000Z",
        expiresAt: "2026-11-10T00:00:00.000Z",
        status: "active",
        createdBy: "user_01AAAAAAAAAAAAAAAAAAAAAAAA",
        createdAt: "2026-10-01T00:00:00.000Z",
      };
      const ancestor: Leash = {
        ...base,
        id: PARENT_ID,
        limits: { ...limits, perTxMaxCents: amountCents + 200n, dailyMaxCents: amountCents + 200n },
        allocationCents: amountCents + 1_000n,
      };
      const recentIntents: RecentIntent[] = withRecent
        ? [
            {
              intentId: "int_01HISTORICALHISTORICALH",
              payee: "someone-else@vendor.example",
              amountCents: amountCents + 1n,
              at: "2026-11-01T11:59:00.000Z",
            },
          ]
        : [];
      const ancestorUsage: Readonly<Record<string, Usage>> = withAncestor
        ? {
            [PARENT_ID]: {
              availableCents: amountCents + 2_000n,
              spent24hCents: 0n,
              allowCountLastHour: 0,
              recentIntents: [],
            },
          }
        : {};
      return {
        leash: base,
        ancestors: withAncestor ? [ancestor] : [],
        intent: {
          intentId: "int_01CONSISTENTCONSISTENTC",
          action,
          amountCents,
          currency: "USD",
          payee,
          category,
          memo: "memo",
          taskId: "tsk_01AAAAAAAAAAAAAAAAAAAAAAAA",
          justification,
        },
        usage: { ...account, recentIntents },
        ancestorUsage,
        now: NOW,
      };
    },
  );

/** A pair where the child is a strict narrowing of the parent. */
export const arbAcceptedDelegation: fc.Arbitrary<{
  parent: Leash;
  child: Leash;
  parentUsage: Usage;
}> = fc
  .record({
    parent: arbRandomLeash,
    allocationFactor: fc.nat({ max: 1000 }),
    perTxFactor: fc.nat({ max: 1000 }),
    dailyFactor: fc.nat({ max: 1000 }),
    rateKeep: fc.nat({ max: 8 }),
    actionsKeep: fc.nat({ max: ACTIONS.length }),
    payeesKeep: fc.nat({ max: 4 }),
    categoriesKeep: fc.nat({ max: CATEGORIES.length }),
    stepSeed: fc.nat({ max: 1000 }),
    expiresIndex: fc.nat({ max: INSTANTS.length - 1 }),
    availableCents: arbCents,
  })
  .map(
    ({
      parent,
      allocationFactor,
      perTxFactor,
      dailyFactor,
      rateKeep,
      actionsKeep,
      payeesKeep,
      categoriesKeep,
      stepSeed,
      expiresIndex,
      availableCents,
    }) => {
      const parentUsage: Usage = {
        availableCents,
        spent24hCents: 0n,
        allowCountLastHour: 0,
        recentIntents: [],
      };
      const rootParent: Leash = { ...parent, parentId: null };
      const cappedExpiry = INSTANTS[expiresIndex] ?? rootParent.expiresAt;
      const expiresAt =
        Date.parse(cappedExpiry) < Date.parse(rootParent.expiresAt)
          ? cappedExpiry
          : rootParent.expiresAt;
      const childCategories: AllowedCategories = isCategoryWildcard(rootParent.allowedCategories)
        ? rootParent.allowedCategories
        : rootParent.allowedCategories.slice(0, categoriesKeep);
      const childActions = rootParent.allowedActions
        .filter((action) => action !== "delegate")
        .slice(0, actionsKeep);
      const child: Leash = {
        ...rootParent,
        id: "lsh_01CHILDCHILDCHILDCHILDCHILD",
        parentId: rootParent.id,
        allocationCents: (availableCents * BigInt(allocationFactor)) / 1000n,
        limits: {
          perTxMaxCents: (rootParent.limits.perTxMaxCents * BigInt(perTxFactor)) / 1000n,
          dailyMaxCents: (rootParent.limits.dailyMaxCents * BigInt(dailyFactor)) / 1000n,
          maxTxPerHour: Math.min(rootParent.limits.maxTxPerHour, rateKeep),
        },
        allowedActions: childActions,
        allowedPayees: rootParent.allowedPayees.slice(0, payeesKeep),
        allowedCategories: childCategories,
        stepUpAboveCents: stepUpForChild(rootParent.stepUpAboveCents, stepSeed),
        expiresAt,
        status: "active",
      };
      return { parent: rootParent, child, parentUsage };
    },
  );

function stepUpForChild(original: bigint | null, seed: number): bigint | null {
  if (original === null) {
    return null;
  }
  return (original * BigInt(seed)) / 1000n;
}

/** A random parent/child pair — used to check that accepted pairs stay narrow. */
export const arbDelegationPair: fc.Arbitrary<{
  parent: Leash;
  child: Leash;
  parentUsage: Usage;
}> = fc.record({
  parent: arbRandomLeash,
  child: arbRandomLeash,
  parentUsage: arbUsage,
});
