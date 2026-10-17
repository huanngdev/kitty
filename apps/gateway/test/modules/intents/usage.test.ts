import { describe, expect, test } from "bun:test";
import type { LeashBalance } from "@kitty/ledger";
import {
  type IntentUsageRow,
  type LeashIdentity,
  summarizeUsage,
} from "../../../src/modules/intents/usage";

const NOW = new Date("2026-10-17T12:00:00.000Z");

function at(msAgo: number): Date {
  return new Date(NOW.getTime() - msAgo);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function intent(
  overrides: Partial<IntentUsageRow> & Pick<IntentUsageRow, "intentId" | "leashId">,
): IntentUsageRow {
  return {
    payee: "vendor@example.com",
    amountCents: 100n,
    decision: "ALLOW",
    status: "reserved",
    createdAt: at(10 * MINUTE),
    ...overrides,
  };
}

const leashes: LeashIdentity[] = [
  { id: "lsh_root", parentId: null },
  { id: "lsh_child", parentId: "lsh_root" },
  { id: "lsh_sibling", parentId: "lsh_root" },
];

const balances = new Map<string, LeashBalance>([
  ["lsh_root", { availableCents: 0n, heldCents: 0n }],
  ["lsh_child", { availableCents: 900n, heldCents: 100n }],
  ["lsh_sibling", { availableCents: 0n, heldCents: 0n }],
]);

describe("summarizeUsage", () => {
  const intents: IntentUsageRow[] = [
    // own spend, inside the 24h window and the last hour
    intent({
      intentId: "int_own_recent",
      leashId: "lsh_child",
      amountCents: 100n,
      createdAt: at(30 * MINUTE),
    }),
    // own denied intent: not spend, but still a recent duplicate candidate
    intent({
      intentId: "int_own_denied",
      leashId: "lsh_child",
      amountCents: 500n,
      decision: "DENY",
      status: "denied",
      payee: "dup@example.com",
      createdAt: at(5 * MINUTE),
    }),
    // own settled spend older than 24h: excluded
    intent({
      intentId: "int_own_old",
      leashId: "lsh_child",
      amountCents: 200n,
      status: "settled",
      createdAt: at(25 * HOUR),
    }),
    // sibling spend: only the root subtree sees it
    intent({
      intentId: "int_sibling",
      leashId: "lsh_sibling",
      amountCents: 300n,
      createdAt: at(2 * HOUR),
    }),
    // root's own spend: only the root subtree sees it
    intent({
      intentId: "int_root",
      leashId: "lsh_root",
      amountCents: 50n,
      createdAt: at(3 * HOUR),
    }),
    // received (no money committed), but a recent payee
    intent({
      intentId: "int_own_received",
      leashId: "lsh_child",
      amountCents: 0n,
      decision: "DENY",
      status: "received",
      payee: "pending@example.com",
      createdAt: at(2 * MINUTE),
    }),
  ];

  const summary = summarizeUsage({
    targetLeashId: "lsh_child",
    ancestors: [{ id: "lsh_root", parentId: null }],
    leashes,
    intents,
    balances,
    now: NOW,
  });

  test("own usage is scoped to the leash", () => {
    expect(summary.usage.availableCents).toBe(900n);
    // 100 (recent reserved) only; denied/old/root/sibling excluded
    expect(summary.usage.spent24hCents).toBe(100n);
    // one ALLOW in the last hour
    expect(summary.usage.allowCountLastHour).toBe(1);
  });

  test("recent intents cover the last 10 minutes with a payee", () => {
    const ids = summary.usage.recentIntents.map((recent) => recent.intentId).sort();

    expect(ids).toEqual(["int_own_denied", "int_own_received"]);
    expect(summary.usage.recentIntents.every((recent) => recent.at.length > 0)).toBe(true);
  });

  test("ancestor usage rolls up the whole subtree", () => {
    const rootUsage = summary.ancestorUsage.lsh_root;

    expect(rootUsage).toBeDefined();
    // 100 (child) + 300 (sibling) + 50 (root); denied and >24h excluded
    expect(rootUsage?.spent24hCents).toBe(450n);
    // the child's ALLOW is the only decision in the last hour across the subtree
    expect(rootUsage?.allowCountLastHour).toBe(1);
    // ancestors keep no recent-intent list (the engine ignores it)
    expect(rootUsage?.recentIntents).toEqual([]);
  });

  test("ancestor usage is present for every ancestor", () => {
    expect(Object.keys(summary.ancestorUsage)).toEqual(["lsh_root"]);
  });

  test("a root leash with no ancestors has an empty ancestorUsage", () => {
    const rootSummary = summarizeUsage({
      targetLeashId: "lsh_root",
      ancestors: [],
      leashes,
      intents,
      balances,
      now: NOW,
    });

    expect(rootSummary.ancestorUsage).toEqual({});
    // root's own spend is only its own line, not the whole tree
    expect(rootSummary.usage.spent24hCents).toBe(50n);
  });
});
