import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { moneyWireSchema } from "../leash-admin/money.schema";
import { categorySchema } from "../events/events.schema";

/**
 * Vendor contracts for the Web App API (docs/09-data-model.md §2,
 * docs/10-api-spec.md §4).
 *
 * A vendor starts with `verified=false` (AGENTS.md invariant #12): agents may
 * only propose vendors, and only the event organizer can flip a vendor to
 * `verified=true` — which is also what registers its PayPal email as a verified
 * payee on the gateway.
 */

/** Lowercase PayPal email; the gateway `verified_payees` key. */
export const vendorEmailSchema = z
  .email()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => value.length > 0, { error: "paypal email is required" });

export type VendorEmail = z.infer<typeof vendorEmailSchema>;

/** `POST /api/events/:id/vendors` body. */
export const createVendorSchema = z.object({
  name: z.string().min(1).max(160),
  paypalEmail: vendorEmailSchema,
  category: categorySchema,
  /** Vendor quote; optional, a decimal money string. */
  quote: moneyWireSchema.nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;

/** `PATCH /api/events/:id/vendors/:vendorId` body — every field optional. */
export const updateVendorSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  paypalEmail: vendorEmailSchema.optional(),
  category: categorySchema.optional(),
  quote: moneyWireSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

export const vendorSchema = z.object({
  id: idSchema(idPrefixes.vendor),
  eventId: idSchema(idPrefixes.event),
  name: z.string(),
  paypalEmail: z.string(),
  category: categorySchema,
  quote: moneyWireSchema.nullable(),
  notes: z.string().nullable(),
  /** `false` until the organizer verifies; agents can never set this. */
  verified: z.boolean(),
});

export type Vendor = z.infer<typeof vendorSchema>;

/** `GET /api/events/:id/vendors` response. */
export const vendorListResponseSchema = z.object({ items: z.array(vendorSchema) });

export type VendorListResponse = z.infer<typeof vendorListResponseSchema>;

/** Response body of `POST`, `PATCH` and the `verify` route. */
export const vendorDetailResponseSchema = vendorSchema;

export type VendorDetailResponse = z.infer<typeof vendorDetailResponseSchema>;
