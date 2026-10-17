import { ACTIONS, CATEGORIES, LEASH_STATUSES } from "@kitty/leash";
import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { moneyWireSchema } from "./money.schema";

/**
 * Leash contracts for the Gateway Admin API (docs/10-api-spec.md §1,
 * docs/05-leash-spec.md §2/§11).
 *
 * Action, status and category enums are imported from `@kitty/leash` so the
 * wire contract can never drift from the policy engine.
 */

export const actionSchema = z.enum(ACTIONS);

export type ActionWire = z.infer<typeof actionSchema>;

export const leashStatusSchema = z.enum(LEASH_STATUSES);

export type LeashStatusWire = z.infer<typeof leashStatusSchema>;

export const categorySchema = z.enum(CATEGORIES);

export type CategoryWire = z.infer<typeof categorySchema>;

/** Concrete categories, or the wildcard `["*"]` (docs/05 §2). */
export const allowedCategoriesSchema = z.union([
  z.array(categorySchema).min(1),
  z.tuple([z.literal("*")]),
]);

export type AllowedCategoriesWire = z.infer<typeof allowedCategoriesSchema>;

export const leashLimitsSchema = z.object({
  perTxMax: moneyWireSchema,
  dailyMax: moneyWireSchema,
  maxTxPerHour: z.number().int().nonnegative(),
});

export type LeashLimitsWire = z.infer<typeof leashLimitsSchema>;

/** `POST /v1/leashes` body (docs/10-api-spec.md §1 "Leash create body"). */
export const createLeashSchema = z.object({
  kittyId: idSchema(idPrefixes.kitty),
  agentId: idSchema(idPrefixes.agent),
  allocation: moneyWireSchema,
  limits: leashLimitsSchema,
  allowedActions: z.array(actionSchema).min(1),
  /** Lowercase PayPal emails or `member:*`. */
  allowedPayees: z.array(z.string().min(1)).default([]),
  allowedCategories: allowedCategoriesSchema.default(["*"]),
  stepUpAbove: moneyWireSchema.nullable().default(null),
  expiresAt: z.iso.datetime(),
});

export type CreateLeashInput = z.infer<typeof createLeashSchema>;

export const leashSchema = z.object({
  id: idSchema(idPrefixes.leash),
  kittyId: idSchema(idPrefixes.kitty),
  parentId: idSchema(idPrefixes.leash).nullable(),
  agentId: idSchema(idPrefixes.agent),
  currency: z.string().min(1),
  allocation: moneyWireSchema,
  limits: leashLimitsSchema,
  allowedActions: z.array(actionSchema),
  allowedPayees: z.array(z.string()),
  allowedCategories: z.array(z.string()),
  stepUpAbove: moneyWireSchema.nullable(),
  notBefore: z.string(),
  expiresAt: z.string(),
  status: leashStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string(),
});

export type Leash = z.infer<typeof leashSchema>;

/** `available` / `held` from the ledger, the §2 leash view. */
export const leashUsageSchema = z.object({
  available: moneyWireSchema,
  held: moneyWireSchema,
});

export type LeashUsage = z.infer<typeof leashUsageSchema>;

/** `GET /v1/kitties/:id/leashes` item: the leash plus its live usage. */
export const leashListItemSchema = leashSchema.extend({ usage: leashUsageSchema });

export type LeashListItem = z.infer<typeof leashListItemSchema>;

/** `GET /v1/leashes/:id` response: usage plus the delegated children. */
export const leashDetailSchema = leashSchema.extend({
  available: moneyWireSchema,
  held: moneyWireSchema,
  spent24h: moneyWireSchema,
  children: z.array(leashSchema),
});

export type LeashDetail = z.infer<typeof leashDetailSchema>;

/** `POST /v1/leashes/:id/topup` body. */
export const topupLeashSchema = z.object({
  amount: moneyWireSchema,
});

export type TopupLeashInput = z.infer<typeof topupLeashSchema>;

/** `POST /v1/leashes/:id/pause|resume|revoke` body. */
export const leashTransitionSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export type LeashTransitionInput = z.infer<typeof leashTransitionSchema>;
