import type {
  EvaluateInput,
  Leash,
  LeashBalance,
  LeashLimits,
  RecentIntent,
  SpendIntent,
  Usage,
} from "../../src/types";

/** A single instant used across deterministic unit tests. */
export const NOW = "2026-11-01T12:00:00.000Z";

export function makeLimits(overrides: Partial<LeashLimits> = {}): LeashLimits {
  return { perTxMaxCents: 40_000n, dailyMaxCents: 50_000n, maxTxPerHour: 5, ...overrides };
}

export function makeLeash(overrides: Partial<Leash> = {}): Leash {
  return {
    id: "lsh_01AAAAAAAAAAAAAAAAAAAAAAAA",
    kittyId: "kty_01AAAAAAAAAAAAAAAAAAAAAAAA",
    parentId: null,
    agentId: "agt_01AAAAAAAAAAAAAAAAAAAAAAAA",
    agentPublicKey: "cHVibGlja2V5LWJhc2U2NHVybA",
    currency: "USD",
    allocationCents: 50_000n,
    limits: makeLimits(),
    allowedActions: ["payout"],
    allowedPayees: ["merch-shop@vendor.example"],
    allowedCategories: ["merch"],
    stepUpAboveCents: null,
    notBefore: "2026-11-01T00:00:00.000Z",
    expiresAt: "2026-11-10T00:00:00.000Z",
    status: "active",
    createdBy: "user_01AAAAAAAAAAAAAAAAAAAAAAAA",
    createdAt: "2026-10-31T00:00:00.000Z",
    ...overrides,
  };
}

export function makeIntent(overrides: Partial<SpendIntent> = {}): SpendIntent {
  return {
    intentId: "int_01BBBBBBBBBBBBBBBBBBBBBBBB",
    action: "payout",
    amountCents: 33_600n,
    currency: "USD",
    payee: "merch-shop@vendor.example",
    category: "merch",
    memo: "12 hoodies for Da Lat offsite",
    taskId: "tsk_01CCCCCCCCCCCCCCCCCCCCCCCC",
    justification: "Channel3 product at $28 each",
    ...overrides,
  };
}

export function makeRecentIntent(overrides: Partial<RecentIntent> = {}): RecentIntent {
  return {
    intentId: "int_01DDDDDDDDDDDDDDDDDDDDDDDD",
    payee: "merch-shop@vendor.example",
    amountCents: 33_600n,
    at: "2026-11-01T11:58:00.000Z",
    ...overrides,
  };
}

export function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    availableCents: 50_000n,
    spent24hCents: 0n,
    allowCountLastHour: 0,
    recentIntents: [],
    ...overrides,
  };
}

export function makeInput(overrides: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    leash: makeLeash(),
    ancestors: [],
    intent: makeIntent(),
    usage: makeUsage(),
    ancestorUsage: {},
    now: NOW,
    ...overrides,
  };
}

export function makeBalance(overrides: Partial<LeashBalance> = {}): LeashBalance {
  return { availableCents: 0n, heldCents: 0n, ...overrides };
}
