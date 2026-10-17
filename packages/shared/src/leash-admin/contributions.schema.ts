import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { moneyWireSchema } from "./money.schema";

/**
 * Contribution contracts for `GET /v1/kitties/:id/contributions`
 * (docs/10-api-spec.md §1, docs/09-data-model.md §3.2).
 *
 * Money entering a kitty: a member invoice payment or an organizer top-up
 * (`source` = `invoice` | `order` | `seed`).
 */

export const contributionSourceSchema = z.enum(["invoice", "order", "seed"]);

export type ContributionSource = z.infer<typeof contributionSourceSchema>;

export const contributionSchema = z.object({
  id: idSchema(idPrefixes.contribution),
  kittyId: idSchema(idPrefixes.kitty),
  /** `null` when the organizer funds the kitty directly. */
  memberId: z.string().nullable(),
  source: contributionSourceSchema,
  amount: moneyWireSchema,
  refunded: moneyWireSchema,
  receivedAt: z.string(),
});

export type Contribution = z.infer<typeof contributionSchema>;
