ALTER TABLE "leash"."webhook_events" ADD COLUMN "status" text DEFAULT 'received' NOT NULL;--> statement-breakpoint
CREATE INDEX "spend_intents_status_updated_at_idx" ON "leash"."spend_intents" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "spend_intents_paypal_ref_idx" ON "leash"."spend_intents" USING btree ("paypal_ref");--> statement-breakpoint
CREATE INDEX "webhook_events_status_received_at_idx" ON "leash"."webhook_events" USING btree ("status","received_at");--> statement-breakpoint
ALTER TABLE "leash"."webhook_events" ADD CONSTRAINT "webhook_events_status_known" CHECK ("leash"."webhook_events"."status" IN ('received', 'processed', 'ignored', 'failed'));