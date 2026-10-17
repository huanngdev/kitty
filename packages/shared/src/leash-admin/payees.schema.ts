import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";

/**
 * Verified-payee contracts (AGENTS.md invariant #12, docs/10-api-spec.md §1).
 *
 * A vendor email must be confirmed by the kitty organizer before a leash may
 * name it in `allowedPayees`. The gateway owns this table
 * (`leash.verified_payees`); agents can only propose vendors, never verify them.
 */

export const payeeEmailSchema = z.email().transform((value) => value.trim().toLowerCase());

/** `POST /v1/kitties/:id/payees` body. */
export const verifyPayeeSchema = z.object({
  email: payeeEmailSchema,
});

export type VerifyPayeeInput = z.infer<typeof verifyPayeeSchema>;

export const verifiedPayeeSchema = z.object({
  kittyId: idSchema(idPrefixes.kitty),
  /** Lowercase PayPal email. */
  email: z.string().min(1),
  /** Organizer user id that verified the payee. */
  verifiedBy: z.string().min(1),
  verifiedAt: z.string(),
});

export type VerifiedPayee = z.infer<typeof verifiedPayeeSchema>;

/** `DELETE /v1/kitties/:id/payees/:email` response. */
export const removePayeeResponseSchema = z.object({
  email: z.string().min(1),
});

export type RemovePayeeResponse = z.infer<typeof removePayeeResponseSchema>;
