import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  numeric,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { appSchema } from "./app-schema";
import { user } from "./auth";

/** Re-exported so `@kitty/db` still exposes `appSchema` (it now lives in `app-schema.ts`). */
export { appSchema };

/**
 * `app` schema — product data owned by the web app and `apps/api`
 * (docs/09-data-model.md §2).
 *
 * Invariants (AGENTS.md §3): money is `bigint` **cents** (`mode: "bigint"`,
 * `…_cents` names); ids are text ULIDs with an AGENTS.md prefix (`evt_`, `mem_`,
 * `bdl_`, `ven_`); timestamps are `timestamptz` in UTC. The gateway mirrors an
 * event as a kitty via `kitty_id`; nothing money-bearing is written here.
 */

/**
 * One organizer's event: a trip, offsite or wedding (docs/04). `organizer_id`
 * anchors every product row to the Better Auth `user` (`./auth.ts`).
 */
export const events = appSchema.table(
  "events",
  {
    id: text("id").primaryKey(),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
    /** Calendar dates (`YYYY-MM-DD`), not instants. */
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    currency: text("currency").notNull().default("USD"),
    budgetCents: bigint("budget_cents", { mode: "bigint" }).notNull(),
    /** Suggested contribution per member; `null` means not set. */
    perMemberCents: bigint("per_member_cents", { mode: "bigint" }),
    /** `planning` | `collecting` | `active` | `settling` | `settled`. */
    status: text("status").notNull().default("planning"),
    /** The gateway kitty for this event (`leash.kitties.id`). */
    kittyId: text("kitty_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("events_budget_cents_non_negative", sql`${t.budgetCents} >= 0`),
    check(
      "events_per_member_cents_non_negative",
      sql`${t.perMemberCents} is null or ${t.perMemberCents} >= 0`,
    ),
    index("events_organizer_id_idx").on(t.organizerId),
  ],
);

/** A member who owes a share of the kitty (docs/09 §2). */
export const members = appSchema.table(
  "members",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Invoice recipient email (sandbox personal account); stored lowercase. */
    email: text("email").notNull(),
    /** Relative contribution weight; `numeric(6,3)` so `1.000` is the default. */
    shareWeight: numeric("share_weight", { precision: 6, scale: 3, mode: "number" })
      .notNull()
      .default(1),
    /** Secret token of the no-login member portal link (32 random bytes, base64url). */
    memberToken: text("member_token").notNull().unique(),
    slackHandle: text("slack_handle"),
  },
  (t) => [unique("members_event_id_email_unique").on(t.eventId, t.email)],
);

/** Planned spend for one category of an event (docs/09 §2). */
export const budgetLines = appSchema.table(
  "budget_lines",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** `lodging` | `food` | `transport` | `gear` | `merch` | `activities` | `other`. */
    category: text("category").notNull(),
    plannedCents: bigint("planned_cents", { mode: "bigint" }).notNull(),
  },
  (t) => [
    unique("budget_lines_event_id_category_unique").on(t.eventId, t.category),
    check("budget_lines_planned_cents_non_negative", sql`${t.plannedCents} >= 0`),
  ],
);

/**
 * A vendor the organizer (or an agent proposing one) wants to pay
 * (AGENTS.md invariant #12, docs/09 §2).
 *
 * `verified` stays `false` until the organizer confirms the vendor; only then
 * is its `paypal_email` registered as a gateway verified payee.
 */
export const vendors = appSchema.table(
  "vendors",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Lowercase PayPal email of the vendor. */
    paypalEmail: text("paypal_email").notNull(),
    /** `lodging` | `food` | `transport` | `gear` | `merch` | `activities` | `other`. */
    category: text("category").notNull(),
    quoteCents: bigint("quote_cents", { mode: "bigint" }),
    notes: text("notes"),
    /** Organizer confirmation gate; never set by an agent (invariant #12). */
    verified: boolean("verified").notNull().default(false),
  },
  (t) => [
    check("vendors_quote_cents_non_negative", sql`${t.quoteCents} is null or ${t.quoteCents} >= 0`),
    index("vendors_event_id_idx").on(t.eventId),
  ],
);

/** Row types (`$inferSelect`) and insert types (`$inferInsert`) of the schema. */
export type EventRow = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type MemberRow = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type BudgetLineRow = typeof budgetLines.$inferSelect;
export type NewBudgetLine = typeof budgetLines.$inferInsert;
export type VendorRow = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
