import { ACTIONS, LEASH_STATUSES } from "@kitty/leash";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * `leash` schema — the money ledger owned by the Leash Gateway
 * (docs/09-data-model.md §3–§4).
 *
 * Invariants (AGENTS.md §3): money is `bigint` **cents** (`mode: "bigint"`,
 * `…_cents` names); ids are text ULIDs with an AGENTS.md prefix; timestamps are
 * `timestamptz` in UTC. Only `apps/gateway` reads or writes these tables.
 */

/** The Postgres schema that owns every leash table, enum and view. */
export const leashSchema = pgSchema("leash");

/**
 * Leash lifecycle statuses (docs/05 §11). Imported from `@kitty/leash` so the
 * database enum and the policy engine can never drift apart.
 */
export const leashStatusEnum = leashSchema.enum("leash_status", LEASH_STATUSES);

/**
 * Spend intent statuses (docs/05 §4). `@kitty/leash` has no runtime array for
 * these, so the list lives here and a test asserts it matches docs/05 §4.
 */
export const SPEND_INTENT_STATUSES = [
  "received",
  "denied",
  "awaiting_approval",
  "reserved",
  "submitted",
  "settled",
  "failed",
  "released",
  "cancelled",
] as const;

export type SpendIntentStatus = (typeof SPEND_INTENT_STATUSES)[number];

export const spendIntentStatusEnum = leashSchema.enum("spend_intent_status", SPEND_INTENT_STATUSES);

/** Approval statuses (docs/09 §3). */
export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const approvalStatusEnum = leashSchema.enum("approval_status", APPROVAL_STATUSES);

/** Leash actions (docs/05 §3), imported from `@kitty/leash`. */
export const leashActionEnum = leashSchema.enum("leash_action", ACTIONS);

/** A kitty: the pooled fund of one event / one organizer (docs/09 §3). */
export const kitties = leashSchema.table("kitties", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  ownerUserId: text("owner_user_id").notNull(),
  currency: text("currency").notNull().default("USD"),
  /** `open` | `settling` | `closed`. */
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Per-agent Ed25519 public key (docs/05 §5). */
export const agentKeys = leashSchema.table("agent_keys", {
  agentId: text("agent_id").primaryKey(),
  kittyId: text("kitty_id")
    .notNull()
    .references(() => kitties.id),
  role: text("role").notNull(),
  publicKey: text("public_key").notNull(),
  /** `active` | `rotated` | `disabled`. */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A leash: a bounded spend authorization granted to one agent (docs/05 §2). */
export const leashes = leashSchema.table(
  "leashes",
  {
    id: text("id").primaryKey(),
    kittyId: text("kitty_id")
      .notNull()
      .references(() => kitties.id),
    parentId: text("parent_id").references((): AnyPgColumn => leashes.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agentKeys.agentId),
    currency: text("currency").notNull().default("USD"),
    /** Total granted; the bounded-loss ceiling. */
    allocationCents: bigint("allocation_cents", { mode: "bigint" }).notNull(),
    perTxMaxCents: bigint("per_tx_max_cents", { mode: "bigint" }).notNull(),
    dailyMaxCents: bigint("daily_max_cents", { mode: "bigint" }).notNull(),
    maxTxPerHour: integer("max_tx_per_hour").notNull(),
    /** Allow-listed actions (docs/05 §3). */
    allowedActions: text("allowed_actions").array().notNull(),
    /** Lowercase PayPal emails or `member:*`. */
    allowedPayees: text("allowed_payees").array().notNull(),
    /** Concrete categories, or `{"*"}` for every category. */
    allowedCategories: text("allowed_categories").array().notNull(),
    /** Amount above which a step-up approval is required, or `null` for never. */
    stepUpAboveCents: bigint("step_up_above_cents", { mode: "bigint" }),
    notBefore: timestamp("not_before", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: leashStatusEnum("status").notNull().default("active"),
    statusReason: text("status_reason"),
    /** Organizer user id, or the parent agent id for a delegated leash. */
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    check("leashes_allocation_cents_non_negative", sql`${t.allocationCents} >= 0`),
    check("leashes_per_tx_max_cents_non_negative", sql`${t.perTxMaxCents} >= 0`),
    check("leashes_daily_max_cents_non_negative", sql`${t.dailyMaxCents} >= 0`),
    check("leashes_max_tx_per_hour_non_negative", sql`${t.maxTxPerHour} >= 0`),
    check(
      "leashes_step_up_above_cents_non_negative",
      sql`${t.stepUpAboveCents} is null or ${t.stepUpAboveCents} >= 0`,
    ),
    index("leashes_kitty_id_status_idx").on(t.kittyId, t.status),
    index("leashes_agent_id_active_idx")
      .on(t.agentId)
      .where(sql`${t.status} = 'active'`),
  ],
);

/**
 * Payee email the kitty organizer has verified (AGENTS.md invariant #12,
 * docs/10-api-spec.md §1).
 *
 * A leash may only name payees in `allowedPayees` that appear here with the
 * same lowercase email; `member:*` is the only non-email token. Agents can
 * propose vendors but only the organizer can insert a row here.
 */
export const verifiedPayees = leashSchema.table(
  "verified_payees",
  {
    kittyId: text("kitty_id")
      .notNull()
      .references(() => kitties.id),
    /** Lowercase PayPal email, e.g. `homestay@vendor.example`. */
    email: text("email").notNull(),
    /** Organizer user id that verified the payee. */
    verifiedBy: text("verified_by").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.kittyId, t.email] })],
);

/** One spend intent: the end-to-end idempotency unit (docs/05 §4, §7). */
export const spendIntents = leashSchema.table(
  "spend_intents",
  {
    /** Agent-generated `int_` + ULID; the idempotency key (PK). */
    id: text("id").primaryKey(),
    leashId: text("leash_id")
      .notNull()
      .references(() => leashes.id),
    agentId: text("agent_id").notNull(),
    action: leashActionEnum("action").notNull(),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    payee: text("payee"),
    category: text("category"),
    memo: text("memo").notNull(),
    taskId: text("task_id"),
    justification: text("justification"),
    /** SHA-256 of the signed body; same id with a different hash is a 409. */
    requestHash: text("request_hash").notNull(),
    /** `ALLOW` | `DENY` | `STEP_UP`. */
    decision: text("decision").notNull(),
    reasons: jsonb("reasons")
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: spendIntentStatusEnum("status").notNull(),
    /** `payout_item_id` | `invoice_id` | `refund_id` … */
    paypalRef: text("paypal_ref"),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("spend_intents_amount_cents_non_negative", sql`${t.amountCents} >= 0`),
    index("spend_intents_leash_id_created_at_idx").on(t.leashId, t.createdAt.desc()),
    index("spend_intents_payee_amount_created_at_idx").on(t.payee, t.amountCents, t.createdAt),
  ],
);

/** Step-up approval for a `STEP_UP` intent (docs/05 §10). */
export const approvals = leashSchema.table("approvals", {
  id: text("id").primaryKey(),
  intentId: text("intent_id")
    .notNull()
    .unique()
    .references(() => spendIntents.id),
  kittyId: text("kitty_id")
    .notNull()
    .references(() => kitties.id),
  status: approvalStatusEnum("status").notNull().default("pending"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Money entering a kitty: a member invoice payment or an organizer top-up. */
export const contributions = leashSchema.table(
  "contributions",
  {
    id: text("id").primaryKey(),
    kittyId: text("kitty_id")
      .notNull()
      .references(() => kitties.id),
    /** `null` when the organizer funds the kitty directly. */
    memberId: text("member_id"),
    /** `invoice` | `order` | `seed`. */
    source: text("source").notNull(),
    paypalInvoiceId: text("paypal_invoice_id").unique(),
    /** Capture id, kept so the contribution can be refunded. */
    paypalCaptureId: text("paypal_capture_id").unique(),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    refundedCents: bigint("refunded_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("contributions_amount_cents_non_negative", sql`${t.amountCents} >= 0`),
    check("contributions_refunded_cents_non_negative", sql`${t.refundedCents} >= 0`),
  ],
);

/**
 * Append-only double-entry ledger (docs/05 §8). `amount_cents` is signed: a
 * negative line moves money out of `account`, a positive line moves it in, and
 * the lines of one `txn_id` sum to zero. A deferred check job (not a DB
 * constraint) enforces the balance invariant.
 */
export const ledgerEntries = leashSchema.table(
  "ledger_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kittyId: text("kitty_id").notNull(),
    txnId: text("txn_id").notNull(),
    /** Canonical account key, e.g. `kitty:{id}:available` (docs/05 §8.1). */
    account: text("account").notNull(),
    /** Signed cents: negative leaves the account, positive enters it. */
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    /** `contribution` | `allocate` | `reserve` | `settle` | `release` | `revoke_return` | `refund` | `topup`. */
    kind: text("kind").notNull(),
    /** Intent id or contribution id this line belongs to. */
    ref: text("ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ledger_entries_kitty_id_account_idx").on(t.kittyId, t.account),
    index("ledger_entries_account_idx").on(t.account),
    index("ledger_entries_txn_id_idx").on(t.txnId),
  ],
);

/** Every PayPal object created for a kitty (docs/11). `id` is the PayPal id. */
export const paypalObjects = leashSchema.table(
  "paypal_objects",
  {
    id: text("id").primaryKey(),
    /** `invoice` | `order` | `capture` | `payout_batch` | `payout_item` | `refund`. */
    kind: text("kind").notNull(),
    intentId: text("intent_id"),
    kittyId: text("kitty_id").notNull(),
    status: text("status").notNull(),
    /** Payload with unnecessary PII filtered out. */
    raw: jsonb("raw").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("paypal_objects_kind_id_unique").on(t.kind, t.id)],
);

/** Verified PayPal webhooks, deduped by event id (docs/11). */
export const webhookEvents = leashSchema.table("webhook_events", {
  /** PayPal event id; the dedupe key (PK). */
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  verified: boolean("verified").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
});

/** Request-signing nonces; PK `(agent_id, nonce)`, swept by `expires_at`. */
export const nonces = leashSchema.table(
  "nonces",
  {
    agentId: text("agent_id").notNull(),
    nonce: text("nonce").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.agentId, t.nonce] }),
    index("nonces_expires_at_idx").on(t.expiresAt),
  ],
);

/**
 * Append-only audit log. A migration-level trigger rejects `UPDATE` and
 * `DELETE`; see the `leash_append_only` custom migration.
 */
export const auditEvents = leashSchema.table("audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kittyId: text("kitty_id").notNull(),
  /** `user:{id}` | `agent:{id}` | `paypal` | `system`. */
  actor: text("actor").notNull(),
  type: text("type").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Transactional outbox for domain events (docs/06). */
export const outbox = leashSchema.table("outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kittyId: text("kitty_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
});

/**
 * View §4: balance per `(kitty_id, account)`, the sum of the signed ledger
 * lines. Internal buckets (`kitty:*`, `leash:*`) must stay non-negative (I2).
 */
export const accountBalances = leashSchema.view("account_balances", {
  kittyId: text("kitty_id").notNull(),
  account: text("account").notNull(),
  balanceCents: bigint("balance_cents", { mode: "bigint" }).notNull(),
}).as(sql`
    select
      ${ledgerEntries.kittyId} as kitty_id,
      ${ledgerEntries.account} as account,
      cast(sum(${ledgerEntries.amountCents}) as bigint) as balance_cents
    from ${ledgerEntries}
    group by ${ledgerEntries.kittyId}, ${ledgerEntries.account}
  `);

/**
 * View §4: per-leash summary of the `available` and `held` buckets, the shape
 * `@kitty/ledger` exposes as `leashBalance`. A leash id never contains `:`.
 */
export const leashBalances = leashSchema.view("leash_balances", {
  kittyId: text("kitty_id").notNull(),
  leashId: text("leash_id").notNull(),
  availableCents: bigint("available_cents", { mode: "bigint" }).notNull(),
  heldCents: bigint("held_cents", { mode: "bigint" }).notNull(),
}).as(sql`
    select
      ${ledgerEntries.kittyId} as kitty_id,
      split_part(${ledgerEntries.account}, ':', 2) as leash_id,
      cast(sum(
        case when ${ledgerEntries.account} like 'leash:%:available' then ${ledgerEntries.amountCents} else 0 end
      ) as bigint) as available_cents,
      cast(sum(
        case when ${ledgerEntries.account} like 'leash:%:held' then ${ledgerEntries.amountCents} else 0 end
      ) as bigint) as held_cents
    from ${ledgerEntries}
    where ${ledgerEntries.account} like 'leash:%'
    group by ${ledgerEntries.kittyId}, split_part(${ledgerEntries.account}, ':', 2)
  `);

/** Row types (`$inferSelect`) and insert types (`$inferInsert`) of the schema. */
export type KittyRow = typeof kitties.$inferSelect;
export type NewKitty = typeof kitties.$inferInsert;
export type AgentKeyRow = typeof agentKeys.$inferSelect;
export type NewAgentKey = typeof agentKeys.$inferInsert;
export type LeashRow = typeof leashes.$inferSelect;
export type NewLeash = typeof leashes.$inferInsert;
export type VerifiedPayeeRow = typeof verifiedPayees.$inferSelect;
export type NewVerifiedPayee = typeof verifiedPayees.$inferInsert;
export type SpendIntentRow = typeof spendIntents.$inferSelect;
export type NewSpendIntent = typeof spendIntents.$inferInsert;
export type ApprovalRow = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type ContributionRow = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
export type PaypalObjectRow = typeof paypalObjects.$inferSelect;
export type NewPaypalObject = typeof paypalObjects.$inferInsert;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type NonceRow = typeof nonces.$inferSelect;
export type NewNonce = typeof nonces.$inferInsert;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type OutboxRow = typeof outbox.$inferSelect;
export type NewOutbox = typeof outbox.$inferInsert;
export type AccountBalanceRow = typeof accountBalances.$inferSelect;
export type LeashBalanceRow = typeof leashBalances.$inferSelect;
