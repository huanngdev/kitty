import { describe, expect, test } from "bun:test";
import { ACTIONS, LEASH_STATUSES } from "@kitty/leash";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  accountBalances,
  agentKeys,
  APPROVAL_STATUSES,
  approvalStatusEnum,
  approvals,
  auditEvents,
  contributions,
  kitties,
  leashActionEnum,
  leashBalances,
  leashes,
  leashStatusEnum,
  ledgerEntries,
  nonces,
  outbox,
  paypalObjects,
  SPEND_INTENT_STATUSES,
  spendIntentStatusEnum,
  spendIntents,
  verifiedPayees,
  WEBHOOK_EVENT_STATUSES,
  webhookEvents,
} from "./leash";
import type { ContributionRow, LedgerEntryRow, LeashRow, SpendIntentRow } from "./leash";

/** Compile-time guard that a type is exactly `bigint`. */
type IsBigint<T> = [T] extends [bigint] ? ([bigint] extends [T] ? true : false) : false;

/**
 * Money must infer as `bigint`, never `number` (AGENTS.md invariant #4). These
 * exported aliases fail `tsc` if a money column ever changes data type.
 */
export type MoneyColumnsAreBigint = [
  IsBigint<LeashRow["allocationCents"]>,
  IsBigint<LeashRow["perTxMaxCents"]>,
  IsBigint<LeashRow["dailyMaxCents"]>,
  IsBigint<SpendIntentRow["amountCents"]>,
  IsBigint<ContributionRow["amountCents"]>,
  IsBigint<ContributionRow["refundedCents"]>,
  IsBigint<LedgerEntryRow["amountCents"]>,
];

const allTables: ReadonlyArray<readonly [string, PgTable]> = [
  ["kitties", kitties],
  ["agent_keys", agentKeys],
  ["leashes", leashes],
  ["verified_payees", verifiedPayees],
  ["spend_intents", spendIntents],
  ["approvals", approvals],
  ["contributions", contributions],
  ["ledger_entries", ledgerEntries],
  ["paypal_objects", paypalObjects],
  ["webhook_events", webhookEvents],
  ["nonces", nonces],
  ["audit_events", auditEvents],
  ["outbox", outbox],
];

/** Every money column, keyed by table name, as declared in docs/09 §3. */
const moneyColumns: Readonly<Record<string, readonly string[]>> = {
  leashes: ["allocation_cents", "per_tx_max_cents", "daily_max_cents", "step_up_above_cents"],
  spend_intents: ["amount_cents"],
  contributions: ["amount_cents", "refunded_cents"],
  ledger_entries: ["amount_cents"],
};

describe("leash enums match @kitty/leash", () => {
  test("leash status enum equals LEASH_STATUSES", () => {
    expect([...leashStatusEnum.enumValues]).toEqual([...LEASH_STATUSES]);
  });

  test("action enum equals ACTIONS", () => {
    expect([...leashActionEnum.enumValues]).toEqual([...ACTIONS]);
  });

  test("intent status enum equals docs/05 §4 states", () => {
    expect([...spendIntentStatusEnum.enumValues]).toEqual([
      "received",
      "denied",
      "awaiting_approval",
      "reserved",
      "submitted",
      "settled",
      "failed",
      "released",
      "cancelled",
    ]);
    expect([...SPEND_INTENT_STATUSES]).toEqual([...spendIntentStatusEnum.enumValues]);
  });

  test("approval status enum equals docs/09 §3 states", () => {
    expect([...approvalStatusEnum.enumValues]).toEqual([
      "pending",
      "approved",
      "rejected",
      "expired",
    ]);
    expect([...APPROVAL_STATUSES]).toEqual([...approvalStatusEnum.enumValues]);
  });
});

describe("leash tables", () => {
  test("every table lives in the leash schema with the documented name", () => {
    for (const [name, table] of allTables) {
      const config = getTableConfig(table);
      expect(config.name).toBe(name);
      expect(config.schema).toBe("leash");
    }
  });

  test("every money column is a 64-bit bigint", () => {
    for (const [tableName, columns] of Object.entries(moneyColumns)) {
      const table = allTables.find(([name]) => name === tableName);
      expect(table).toBeDefined();
      if (table === undefined) {
        continue;
      }

      const config = getTableConfig(table[1]);
      const byName = new Map(config.columns.map((column) => [column.name, column]));

      for (const columnName of columns) {
        const column = byName.get(columnName);
        expect(column).toBeDefined();
        expect(column?.dataType).toBe("bigint");
        expect(column?.columnType).toBe("PgBigInt64");
      }
    }
  });

  test("ledger amount is signed, but allocation and limits are non-negative", () => {
    const ledgerChecks = getTableConfig(ledgerEntries).checks.map((constraint) => constraint.name);
    expect(ledgerChecks).toHaveLength(0);

    const leashChecks = getTableConfig(leashes).checks.map((constraint) => constraint.name);
    expect(leashChecks).toContain("leashes_allocation_cents_non_negative");
    expect(leashChecks).toContain("leashes_per_tx_max_cents_non_negative");
    expect(leashChecks).toContain("leashes_daily_max_cents_non_negative");

    const contributionChecks = getTableConfig(contributions).checks.map(
      (constraint) => constraint.name,
    );
    expect(contributionChecks).toContain("contributions_amount_cents_non_negative");
    expect(contributionChecks).toContain("contributions_refunded_cents_non_negative");

    const intentChecks = getTableConfig(spendIntents).checks.map((constraint) => constraint.name);
    expect(intentChecks).toContain("spend_intents_amount_cents_non_negative");
  });

  test("idempotency keys: intent PK, webhook event PK, nonce composite PK", () => {
    const intentColumns = getTableConfig(spendIntents).columns;
    expect(intentColumns.find((column) => column.name === "id")?.primary).toBe(true);

    const webhookColumns = getTableConfig(webhookEvents).columns;
    expect(webhookColumns.find((column) => column.name === "id")?.primary).toBe(true);

    const noncePrimaryKey = getTableConfig(nonces).primaryKeys[0];
    expect(noncePrimaryKey?.columns.map((column) => column.name)).toEqual(["agent_id", "nonce"]);
    expect(getTableConfig(nonces).indexes.map((entry) => entry.config.name)).toContain(
      "nonces_expires_at_idx",
    );
  });

  test("webhook events carry a docs-09 status verdict", () => {
    expect([...WEBHOOK_EVENT_STATUSES]).toEqual(["received", "processed", "ignored", "failed"]);

    const columns = getTableConfig(webhookEvents).columns;
    const status = columns.find((column) => column.name === "status");
    expect(status?.notNull).toBe(true);
    expect(status?.hasDefault).toBe(true);

    const checks = getTableConfig(webhookEvents).checks.map((constraint) => constraint.name);
    expect(checks).toContain("webhook_events_status_known");
    expect(getTableConfig(webhookEvents).indexes.map((entry) => entry.config.name)).toContain(
      "webhook_events_status_received_at_idx",
    );
  });

  test("the reconcile sweep can find stale submitted intents by index", () => {
    const indexes = getTableConfig(spendIntents).indexes.map((entry) => entry.config.name);

    expect(indexes).toContain("spend_intents_status_updated_at_idx");
    expect(indexes).toContain("spend_intents_paypal_ref_idx");
  });

  test("paypal objects are unique per (kind, id)", () => {
    const uniqueIndex = getTableConfig(paypalObjects).indexes.find(
      (entry) => entry.config.unique && entry.config.name === "paypal_objects_kind_id_unique",
    );
    expect(uniqueIndex).toBeDefined();
    const indexedColumns = uniqueIndex?.config.columns.map((column) =>
      "name" in column && typeof column.name === "string" ? column.name : undefined,
    );
    expect(indexedColumns).toEqual(["kind", "id"]);
  });

  test("leashes reference kitty, parent leash and agent key", () => {
    const references = getTableConfig(leashes).foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      const foreignTable = getTableConfig(reference.foreignTable);

      return `${reference.columns.map((column) => column.name).join(",")}->${foreignTable.schema}.${foreignTable.name}`;
    });

    expect(references.sort()).toEqual([
      "agent_id->leash.agent_keys",
      "kitty_id->leash.kitties",
      "parent_id->leash.leashes",
    ]);
  });

  test("verified payees are unique per (kitty_id, email)", () => {
    const primaryKey = getTableConfig(verifiedPayees).primaryKeys[0];
    expect(primaryKey?.columns.map((column) => column.name)).toEqual(["kitty_id", "email"]);
  });

  test("views are exposed in the leash schema", () => {
    expect(accountBalances).toBeDefined();
    expect(leashBalances).toBeDefined();
  });
});
