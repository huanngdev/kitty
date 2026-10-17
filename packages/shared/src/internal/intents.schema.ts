import { z } from "zod";

/**
 * Wire contract of the Gateway Internal API (`/internal`, docs/10-api-spec.md §6)
 * used by the worker to execute an approved intent and to read one back.
 *
 * Money crosses this boundary as a decimal string ("12.34"); inside the gateway
 * it is always integer cents (AGENTS.md invariant #4).
 */

/**
 * Spend intent statuses (docs/05 §4). Mirrors `SPEND_INTENT_STATUSES` in
 * `@kitty/db` — the database enum and this wire enum are kept identical by a
 * test in `packages/db`.
 */
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

export type SpendIntentStatusDto = z.infer<typeof spendIntentStatusSchema>;

/** Policy outcome stored on the intent (docs/05 §6). */
export const decisionOutcomeSchema = z.enum(["ALLOW", "DENY", "STEP_UP"]);

export type DecisionOutcomeDto = z.infer<typeof decisionOutcomeSchema>;

/** One policy reason: a stable machine code plus a human-readable detail. */
export const decisionReasonSchema = z.object({
  code: z.string(),
  details: z.string(),
});

export type DecisionReasonDto = z.infer<typeof decisionReasonSchema>;

/** One spend intent as read back through the internal API. */
export const intentViewSchema = z.object({
  intentId: z.string(),
  leashId: z.string(),
  kittyId: z.string(),
  agentId: z.string(),
  action: z.string(),
  /** Decimal money string, for example "12.34". */
  amount: z.string(),
  currency: z.string(),
  payee: z.string().nullable(),
  category: z.string().nullable(),
  memo: z.string(),
  taskId: z.string().nullable(),
  decision: decisionOutcomeSchema,
  reasons: z.array(decisionReasonSchema),
  status: spendIntentStatusSchema,
  /** PayPal object id (for example the payout batch id) once submitted. */
  paypalRef: z.string().nullable(),
  executeAttempts: z.number().int().nonnegative(),
  error: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IntentView = z.infer<typeof intentViewSchema>;

/**
 * How `executeIntent` ended. `submitted` reached PayPal; `failed_released` hit a
 * definitive PayPal rejection and returned the hold; `unknown` kept the intent
 * reserved (safe to retry); `not_implemented` is an action this task does not
 * execute yet; `noop` is an already-executed or unknown intent.
 */
export const executeOutcomeSchema = z.enum([
  "submitted",
  "failed_released",
  "unknown",
  "not_implemented",
  "noop",
]);

export type ExecuteOutcome = z.infer<typeof executeOutcomeSchema>;

/** Response of `POST /internal/intents/:id/execute`. */
export const executeIntentResponseSchema = z.object({
  intent: intentViewSchema,
  outcome: executeOutcomeSchema,
});

export type ExecuteIntentResponse = z.infer<typeof executeIntentResponseSchema>;

/** Response of `GET /internal/intents/:id`. */
export const getIntentResponseSchema = z.object({
  intent: intentViewSchema,
});

export type GetIntentResponse = z.infer<typeof getIntentResponseSchema>;
