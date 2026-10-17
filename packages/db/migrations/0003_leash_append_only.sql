-- Append-only enforcement (docs/09-data-model.md §3, AGENTS.md invariant #6).
--
-- `leash.audit_events` and `leash.ledger_entries` are the sources of truth for
-- audit and money. They may only ever be INSERTed into: an UPDATE or DELETE is
-- a bug or a compromise, so the trigger fails the statement.

CREATE OR REPLACE FUNCTION leash.reject_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'leash.% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON "leash"."audit_events"
FOR EACH ROW EXECUTE FUNCTION leash.reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only
BEFORE UPDATE OR DELETE ON "leash"."ledger_entries"
FOR EACH ROW EXECUTE FUNCTION leash.reject_append_only_mutation();
