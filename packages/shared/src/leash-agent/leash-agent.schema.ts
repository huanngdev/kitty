import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { decisionOutcomeSchema, decisionReasonSchema } from "../internal/intents.schema";
import { spendIntentStatusSchema } from "../leash-admin/intents.schema";
import { actionSchema, categorySchema, leashStatusSchema } from "../leash-admin/leashes.schema";
import { moneyWireSchema } from "../leash-admin/money.schema";

/**
 * Contracts of the Gateway Agent API — MCP tools over Streamable HTTP
 * (docs/10-api-spec.md §2, docs/05-leash-spec.md §13).
 *
 * Money crosses the agent boundary as a decimal string (`"336.00"`); the
 * gateway parses it with `@kitty/ledger` `parseMoney` (AGENTS.md invariant #4).
 * Agents never name a `leashId` or `agentId`: the gateway resolves the active
 * leash of the authenticated agent (docs/10 §2).
 */

/** Largest page `leash_activity` will return (docs/10 §2). */
export const MAX_ACTIVITY_LIMIT = 20;

/** One rolling rate limit of a leash, as seen by the agent. */
export const leashStatusLimitsSchema = z.object({
  perTxMax: moneyWireSchema,
  dailyMax: moneyWireSchema,
  maxTxPerHour: z.number().int().nonnegative(),
});

/** `leash_status` output: the agent's own leash (docs/10 §2). */
export const leashStatusOutputSchema = z.object({
  leashId: idSchema(idPrefixes.leash),
  status: leashStatusSchema,
  currency: z.string().min(1),
  allocation: moneyWireSchema,
  available: moneyWireSchema,
  held: moneyWireSchema,
  spent24h: moneyWireSchema,
  limits: leashStatusLimitsSchema,
  allowedActions: z.array(actionSchema),
  allowedPayees: z.array(z.string()),
  allowedCategories: z.array(z.string()),
  stepUpAbove: moneyWireSchema.nullable(),
  expiresAt: z.string(),
});

/**
 * `leash_check` input: a `SpendIntentRequest` (docs/05 §4) without `intentId`.
 * The action and amount are validated by the gateway; nothing is reserved.
 */
export const leashCheckInputSchema = z.object({
  action: actionSchema,
  amount: moneyWireSchema,
  currency: z.string().min(1).default("USD"),
  payee: z.string().min(1).optional(),
  category: categorySchema.optional(),
  /** PayPal payout note limit is 165 characters (docs/05 §4). */
  memo: z.string().min(1).max(165),
  taskId: idSchema(idPrefixes.task).optional(),
  justification: z.string().min(1),
});

/** `leash_check` output: the Decision, nothing is reserved (docs/10 §2). */
export const leashCheckOutputSchema = z.object({
  decision: decisionOutcomeSchema,
  reasons: z.array(decisionReasonSchema),
});

/** `leash_request_payout` input (docs/10 §2). */
export const leashRequestPayoutInputSchema = z.object({
  intentId: idSchema(idPrefixes.spendIntent),
  amount: moneyWireSchema,
  payee: z.string().min(1),
  category: categorySchema.optional(),
  memo: z.string().min(1).max(165),
  taskId: idSchema(idPrefixes.task).optional(),
  justification: z.string().min(1),
});

/** `leash_request_payout` output (docs/10 §2, `available` is post-reserve). */
export const leashRequestPayoutOutputSchema = z.object({
  intentId: idSchema(idPrefixes.spendIntent),
  decision: decisionOutcomeSchema,
  status: spendIntentStatusSchema,
  reasons: z.array(decisionReasonSchema),
  approvalId: idSchema(idPrefixes.approval).nullable(),
  available: moneyWireSchema,
});

/** `leash_intent_status` input (docs/10 §2). */
export const leashIntentStatusInputSchema = z.object({
  intentId: idSchema(idPrefixes.spendIntent),
});

/**
 * `leash_intent_status` output: the stored intent plus its PayPal object
 * status. `justification` is returned for audit display only — it never
 * influenced the decision (AGENTS.md invariant #2).
 */
export const leashIntentStatusOutputSchema = z.object({
  intentId: idSchema(idPrefixes.spendIntent),
  leashId: idSchema(idPrefixes.leash),
  action: actionSchema,
  amount: moneyWireSchema,
  currency: z.string().min(1),
  payee: z.string().nullable(),
  category: z.string().nullable(),
  memo: z.string(),
  taskId: z.string().nullable(),
  justification: z.string().nullable(),
  decision: decisionOutcomeSchema,
  reasons: z.array(decisionReasonSchema),
  status: spendIntentStatusSchema,
  paypalRef: z.string().nullable(),
  paypalStatus: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** `leash_activity` input: the last N intents of this agent's leash. */
export const leashActivityInputSchema = z.object({
  limit: z.number().int().positive().max(MAX_ACTIVITY_LIMIT).default(MAX_ACTIVITY_LIMIT),
});

/** One intent in `leash_activity`, trimmed to what an agent needs. */
export const leashActivityItemSchema = z.object({
  intentId: idSchema(idPrefixes.spendIntent),
  action: actionSchema,
  amount: moneyWireSchema,
  currency: z.string().min(1),
  payee: z.string().nullable(),
  memo: z.string(),
  justification: z.string().nullable(),
  decision: decisionOutcomeSchema,
  reasons: z.array(decisionReasonSchema),
  status: spendIntentStatusSchema,
  createdAt: z.string(),
});

/** `leash_activity` output (docs/10 §2). */
export const leashActivityOutputSchema = z.object({
  items: z.array(leashActivityItemSchema),
});

/** A short text summary that always accompanies the structured tool result. */
export const toolTextSummarySchema = z.string().min(1);
