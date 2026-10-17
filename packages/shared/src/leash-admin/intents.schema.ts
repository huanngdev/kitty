import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { actionSchema } from "./leashes.schema";
import { moneyWireSchema } from "./money.schema";

/**
 * Spend-intent contracts for `GET /v1/kitties/:id/intents` (docs/10-api-spec.md
 * §1, docs/05-leash-spec.md §4).
 *
 * The list is read-only here: reserving and executing intents lives in the
 * money loop (KIT-16).
 */

/** Spend-intent lifecycle (docs/05 §4, mirrored in the `leash.spend_intent_status` enum). */
export const spendIntentStatusSchema = z.enum([
  "received",
  "denied",
  "awaiting_approval",
  "reserved",
  "submitted",
  "settled",
  "failed",
  "released",
  "cancelled",
]);

export type SpendIntentStatusWire = z.infer<typeof spendIntentStatusSchema>;

export const decisionSchema = z.enum(["ALLOW", "DENY", "STEP_UP"]);

export type DecisionWire = z.infer<typeof decisionSchema>;

export const spendIntentSchema = z.object({
  id: idSchema(idPrefixes.spendIntent),
  leashId: idSchema(idPrefixes.leash),
  agentId: idSchema(idPrefixes.agent),
  action: actionSchema,
  amount: moneyWireSchema,
  currency: z.string().min(1),
  payee: z.string().nullable(),
  category: z.string().nullable(),
  memo: z.string(),
  taskId: z.string().nullable(),
  decision: decisionSchema,
  status: spendIntentStatusSchema,
  paypalRef: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SpendIntent = z.infer<typeof spendIntentSchema>;

/** `GET /v1/kitties/:id/intents?status=&leashId=` query. */
export const listIntentsQuerySchema = z.object({
  status: spendIntentStatusSchema.optional(),
  leashId: idSchema(idPrefixes.leash).optional(),
});

export type ListIntentsQuery = z.infer<typeof listIntentsQuerySchema>;
