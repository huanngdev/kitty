import { pgSchema } from "drizzle-orm/pg-core";

/**
 * `leash` schema — the money ledger owned by the Leash Gateway.
 *
 * Tables (kitties, leashes, spend_intents, ledger_entries, …) are added in
 * Task C; see `docs/09-data-model.md` §3.
 */
export const leashSchema = pgSchema("leash");
