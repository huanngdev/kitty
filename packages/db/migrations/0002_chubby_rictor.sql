CREATE TYPE "leash"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "leash"."leash_action" AS ENUM('payout', 'create_invoice', 'send_reminder', 'create_order', 'refund', 'delegate', 'browser_booking');--> statement-breakpoint
CREATE TYPE "leash"."leash_status" AS ENUM('active', 'paused', 'revoked', 'expired', 'exhausted');--> statement-breakpoint
CREATE TYPE "leash"."spend_intent_status" AS ENUM('received', 'denied', 'awaiting_approval', 'reserved', 'submitted', 'settled', 'failed', 'released', 'cancelled');--> statement-breakpoint
CREATE TABLE "leash"."agent_keys" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"kitty_id" text NOT NULL,
	"role" text NOT NULL,
	"public_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leash"."approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"kitty_id" text NOT NULL,
	"status" "leash"."approval_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "approvals_intent_id_unique" UNIQUE("intent_id")
);
--> statement-breakpoint
CREATE TABLE "leash"."audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kitty_id" text NOT NULL,
	"actor" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leash"."contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"kitty_id" text NOT NULL,
	"member_id" text,
	"source" text NOT NULL,
	"paypal_invoice_id" text,
	"paypal_capture_id" text,
	"amount_cents" bigint NOT NULL,
	"refunded_cents" bigint DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contributions_paypal_invoice_id_unique" UNIQUE("paypal_invoice_id"),
	CONSTRAINT "contributions_paypal_capture_id_unique" UNIQUE("paypal_capture_id"),
	CONSTRAINT "contributions_amount_cents_non_negative" CHECK ("leash"."contributions"."amount_cents" >= 0),
	CONSTRAINT "contributions_refunded_cents_non_negative" CHECK ("leash"."contributions"."refunded_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leash"."kitties" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kitties_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "leash"."leashes" (
	"id" text PRIMARY KEY NOT NULL,
	"kitty_id" text NOT NULL,
	"parent_id" text,
	"agent_id" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"allocation_cents" bigint NOT NULL,
	"per_tx_max_cents" bigint NOT NULL,
	"daily_max_cents" bigint NOT NULL,
	"max_tx_per_hour" integer NOT NULL,
	"allowed_actions" text[] NOT NULL,
	"allowed_payees" text[] NOT NULL,
	"allowed_categories" text[] NOT NULL,
	"step_up_above_cents" bigint,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "leash"."leash_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "leashes_allocation_cents_non_negative" CHECK ("leash"."leashes"."allocation_cents" >= 0),
	CONSTRAINT "leashes_per_tx_max_cents_non_negative" CHECK ("leash"."leashes"."per_tx_max_cents" >= 0),
	CONSTRAINT "leashes_daily_max_cents_non_negative" CHECK ("leash"."leashes"."daily_max_cents" >= 0),
	CONSTRAINT "leashes_max_tx_per_hour_non_negative" CHECK ("leash"."leashes"."max_tx_per_hour" >= 0),
	CONSTRAINT "leashes_step_up_above_cents_non_negative" CHECK ("leash"."leashes"."step_up_above_cents" is null or "leash"."leashes"."step_up_above_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leash"."ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kitty_id" text NOT NULL,
	"txn_id" text NOT NULL,
	"account" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"kind" text NOT NULL,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leash"."nonces" (
	"agent_id" text NOT NULL,
	"nonce" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "nonces_agent_id_nonce_pk" PRIMARY KEY("agent_id","nonce")
);
--> statement-breakpoint
CREATE TABLE "leash"."outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kitty_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leash"."paypal_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"intent_id" text,
	"kitty_id" text NOT NULL,
	"status" text NOT NULL,
	"raw" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leash"."spend_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"leash_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"action" "leash"."leash_action" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" text NOT NULL,
	"payee" text,
	"category" text,
	"memo" text NOT NULL,
	"task_id" text,
	"justification" text,
	"request_hash" text NOT NULL,
	"decision" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "leash"."spend_intent_status" NOT NULL,
	"paypal_ref" text,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_intents_amount_cents_non_negative" CHECK ("leash"."spend_intents"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leash"."webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"verified" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "leash"."agent_keys" ADD CONSTRAINT "agent_keys_kitty_id_kitties_id_fk" FOREIGN KEY ("kitty_id") REFERENCES "leash"."kitties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash"."approvals" ADD CONSTRAINT "approvals_intent_id_spend_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "leash"."spend_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash"."approvals" ADD CONSTRAINT "approvals_kitty_id_kitties_id_fk" FOREIGN KEY ("kitty_id") REFERENCES "leash"."kitties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash"."contributions" ADD CONSTRAINT "contributions_kitty_id_kitties_id_fk" FOREIGN KEY ("kitty_id") REFERENCES "leash"."kitties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash"."leashes" ADD CONSTRAINT "leashes_kitty_id_kitties_id_fk" FOREIGN KEY ("kitty_id") REFERENCES "leash"."kitties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash"."leashes" ADD CONSTRAINT "leashes_parent_id_leashes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "leash"."leashes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash"."leashes" ADD CONSTRAINT "leashes_agent_id_agent_keys_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "leash"."agent_keys"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leash"."spend_intents" ADD CONSTRAINT "spend_intents_leash_id_leashes_id_fk" FOREIGN KEY ("leash_id") REFERENCES "leash"."leashes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leashes_kitty_id_status_idx" ON "leash"."leashes" USING btree ("kitty_id","status");--> statement-breakpoint
CREATE INDEX "leashes_agent_id_active_idx" ON "leash"."leashes" USING btree ("agent_id") WHERE "leash"."leashes"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ledger_entries_kitty_id_account_idx" ON "leash"."ledger_entries" USING btree ("kitty_id","account");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "leash"."ledger_entries" USING btree ("account");--> statement-breakpoint
CREATE INDEX "ledger_entries_txn_id_idx" ON "leash"."ledger_entries" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "nonces_expires_at_idx" ON "leash"."nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_objects_kind_id_unique" ON "leash"."paypal_objects" USING btree ("kind","id");--> statement-breakpoint
CREATE INDEX "spend_intents_leash_id_created_at_idx" ON "leash"."spend_intents" USING btree ("leash_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "spend_intents_payee_amount_created_at_idx" ON "leash"."spend_intents" USING btree ("payee","amount_cents","created_at");--> statement-breakpoint
CREATE VIEW "leash"."account_balances" AS (
    select
      "leash"."ledger_entries"."kitty_id" as kitty_id,
      "leash"."ledger_entries"."account" as account,
      cast(sum("leash"."ledger_entries"."amount_cents") as bigint) as balance_cents
    from "leash"."ledger_entries"
    group by "leash"."ledger_entries"."kitty_id", "leash"."ledger_entries"."account"
  );--> statement-breakpoint
CREATE VIEW "leash"."leash_balances" AS (
    select
      "leash"."ledger_entries"."kitty_id" as kitty_id,
      split_part("leash"."ledger_entries"."account", ':', 2) as leash_id,
      cast(sum(
        case when "leash"."ledger_entries"."account" like 'leash:%:available' then "leash"."ledger_entries"."amount_cents" else 0 end
      ) as bigint) as available_cents,
      cast(sum(
        case when "leash"."ledger_entries"."account" like 'leash:%:held' then "leash"."ledger_entries"."amount_cents" else 0 end
      ) as bigint) as held_cents
    from "leash"."ledger_entries"
    where "leash"."ledger_entries"."account" like 'leash:%'
    group by "leash"."ledger_entries"."kitty_id", split_part("leash"."ledger_entries"."account", ':', 2)
  );