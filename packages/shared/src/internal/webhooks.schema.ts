import { z } from "zod";

/**
 * Wire contract of the reconcile sweep
 * (`POST /internal/sweeps/reconcile`, docs/10-api-spec.md §6).
 *
 * The sweep is the fallback for a missing webhook (docs/11 §4): it polls PayPal
 * for intents stuck in `submitted` and applies the very same settle/release
 * transitions the webhook handler uses, so the local ledger settles without a
 * public HTTPS callback URL.
 */

/** Request body; every field is optional so the worker can just POST `{}`. */
export const reconcileSweepRequestSchema = z.object({
  /**
   * Only intents whose last update is at least this many minutes old are
   * polled (docs/11 §4: 5 minutes in production). `0` is allowed so tests and
   * demos can reconcile immediately.
   */
  olderThanMinutes: z.number().int().nonnegative().max(1440).default(5),
  /** Maximum intents to poll in one call. */
  limit: z.number().int().positive().max(100).default(25),
});

export type ReconcileSweepRequest = z.infer<typeof reconcileSweepRequestSchema>;

/** What one reconcile sweep did. */
export const reconcileSweepResponseSchema = z.object({
  /** Intents polled from PayPal. */
  scanned: z.number().int().nonnegative(),
  /** Intents moved to `settled` (ledger held → payee). */
  settled: z.number().int().nonnegative(),
  /** Intents moved to `released` (hold returned to the leash). */
  failed: z.number().int().nonnegative(),
  /** Intents PayPal has no final answer for yet; they stay `submitted`. */
  unchanged: z.number().int().nonnegative(),
  /** Intents the sweep could not read from PayPal (network/auth error). */
  errored: z.number().int().nonnegative(),
});

export type ReconcileSweepResponse = z.infer<typeof reconcileSweepResponseSchema>;
