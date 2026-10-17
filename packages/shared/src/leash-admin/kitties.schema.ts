import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { moneyWireSchema } from "./money.schema";

/**
 * Kitty contracts for the Gateway Admin API (docs/10-api-spec.md §1).
 *
 * A kitty is the pooled fund of one event. Its balances are computed from the
 * ledger views on every request and are **never** stored (AGENTS.md invariant
 * #5); they are all decimal money strings on the wire.
 */

/** Kitty lifecycle status (docs/09-data-model.md §3.2). */
export const kittyStatusSchema = z.enum(["open", "settling", "closed"]);

export type KittyStatus = z.infer<typeof kittyStatusSchema>;

/** `POST /v1/kitties` body. The organizer is taken from the signed request, not the body. */
export const createKittySchema = z.object({
  eventId: idSchema(idPrefixes.event),
  /** MVP settles in USD only (docs/05-leash-spec.md §2). */
  currency: z.literal("USD").default("USD"),
});

export type CreateKittyInput = z.infer<typeof createKittySchema>;

/**
 * Kitty balances, always read from the ledger (docs/10-api-spec.md §1):
 *
 * - `available`   — money in `kitty:{id}:available`, not yet handed to a leash
 * - `allocated`   — money currently sitting in any `leash:*` bucket of the kitty
 * - `held`        — part of `allocated` reserved by pending spend intents
 * - `spent`       — settled payouts paid out of the kitty's leashes
 * - `contributed` — member invoices / organizer top-ups received
 * - `refunded`    — money refunded to members
 */
export const kittyBalancesSchema = z.object({
  available: moneyWireSchema,
  allocated: moneyWireSchema,
  held: moneyWireSchema,
  spent: moneyWireSchema,
  contributed: moneyWireSchema,
  refunded: moneyWireSchema,
});

export type KittyBalances = z.infer<typeof kittyBalancesSchema>;

export const kittySchema = z.object({
  id: idSchema(idPrefixes.kitty),
  eventId: idSchema(idPrefixes.event),
  ownerUserId: z.string().min(1),
  currency: z.string().min(1),
  status: kittyStatusSchema,
  createdAt: z.string(),
});

export type Kitty = z.infer<typeof kittySchema>;

/** `GET /v1/kitties/:id` and the `POST /v1/kitties` response. */
export const kittyDetailSchema = kittySchema.extend({
  balances: kittyBalancesSchema,
});

export type KittyDetail = z.infer<typeof kittyDetailSchema>;
