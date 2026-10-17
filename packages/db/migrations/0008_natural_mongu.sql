CREATE TABLE "app"."budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"category" text NOT NULL,
	"planned_cents" bigint NOT NULL,
	CONSTRAINT "budget_lines_event_id_category_unique" UNIQUE("event_id","category"),
	CONSTRAINT "budget_lines_planned_cents_non_negative" CHECK ("app"."budget_lines"."planned_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"organizer_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"budget_cents" bigint NOT NULL,
	"per_member_cents" bigint,
	"status" text DEFAULT 'planning' NOT NULL,
	"kitty_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_kitty_id_unique" UNIQUE("kitty_id"),
	CONSTRAINT "events_budget_cents_non_negative" CHECK ("app"."events"."budget_cents" >= 0),
	CONSTRAINT "events_per_member_cents_non_negative" CHECK ("app"."events"."per_member_cents" is null or "app"."events"."per_member_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."members" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"share_weight" numeric(6, 3) DEFAULT 1 NOT NULL,
	"member_token" text NOT NULL,
	"slack_handle" text,
	CONSTRAINT "members_member_token_unique" UNIQUE("member_token"),
	CONSTRAINT "members_event_id_email_unique" UNIQUE("event_id","email")
);
--> statement-breakpoint
CREATE TABLE "app"."vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"paypal_email" text NOT NULL,
	"category" text NOT NULL,
	"quote_cents" bigint,
	"notes" text,
	"verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "vendors_quote_cents_non_negative" CHECK ("app"."vendors"."quote_cents" is null or "app"."vendors"."quote_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."budget_lines" ADD CONSTRAINT "budget_lines_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."events" ADD CONSTRAINT "events_organizer_id_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."members" ADD CONSTRAINT "members_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vendors" ADD CONSTRAINT "vendors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_organizer_id_idx" ON "app"."events" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "vendors_event_id_idx" ON "app"."vendors" USING btree ("event_id");