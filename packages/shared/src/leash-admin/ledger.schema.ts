import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { paginationQuerySchema } from "../common/pagination.schema";
import { signedMoneyWireSchema } from "./money.schema";

/**
 * Ledger contracts for `GET /v1/kitties/:id/ledger` (docs/10-api-spec.md §1,
 * docs/09-data-model.md §3.2).
 *
 * The ledger is append-only; the feed is a cursor-paginated, newest-first view
 * of the raw double-entry lines.
 */

/** DB `kind` values written by the gateway (`leash.ledger_entries.kind`). */
export const ledgerKindSchema = z.enum([
  "contribution",
  "allocate",
  "delegate",
  "reserve",
  "settle",
  "release",
  "revoke_return",
  "refund",
  "topup",
]);

export type LedgerKind = z.infer<typeof ledgerKindSchema>;

export const ledgerEntrySchema = z.object({
  id: z.number().int().nonnegative(),
  kittyId: idSchema(idPrefixes.kitty),
  txnId: z.string().min(1),
  /** Canonical account key, e.g. `kitty:{id}:available` (docs/05 §8). */
  account: z.string().min(1),
  /** Signed cents on the wire: negative leaves the account. */
  amount: signedMoneyWireSchema,
  kind: ledgerKindSchema,
  ref: z.string().nullable(),
  createdAt: z.string(),
});

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/** `GET /v1/kitties/:id/ledger?cursor=` query. */
export const ledgerQuerySchema = paginationQuerySchema;

export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
