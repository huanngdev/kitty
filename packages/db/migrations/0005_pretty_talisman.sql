ALTER TABLE "leash"."spend_intents" ADD COLUMN "payload_hash" text;--> statement-breakpoint
ALTER TABLE "leash"."spend_intents" ADD COLUMN "execute_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leash"."spend_intents" ADD COLUMN "last_execute_error" jsonb;