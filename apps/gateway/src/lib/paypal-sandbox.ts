import { z } from "zod";

/**
 * Pure helpers for `scripts/sandbox-check.ts` (apps/gateway only).
 *
 * Everything here is side-effect free so it can be unit-tested without network:
 * env validation and the `YYYY-MM-DD` date PayPal's `payment_term.due_date`
 * expects. The PayPal request bodies live in `@kitty/paypal` now (KIT-15); see
 * docs/11-paypal-integration.md §2.
 */

/**
 * Treat empty strings (for example `PAYPAL_WEBHOOK_ID=` in a local `.env`) as
 * unset, so a blank optional variable falls back to its default/`undefined`
 * instead of failing validation. Same rule as `src/env.ts`.
 */
const unsetIfEmpty = (value: unknown): unknown => (value === "" ? undefined : value);

/**
 * Env the sandbox check needs. Extra variables (PAYPAL_WEBHOOK_ID) are optional
 * and blank values count as unset. Required blanks are reported by
 * `missingSandboxEnvKeys` before this schema runs.
 */
export const sandboxEnvSchema = z.object({
  PAYPAL_ENV: z.preprocess(unsetIfEmpty, z.enum(["sandbox", "live"]).default("sandbox")),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PLATFORM_PAYPAL_EMAIL: z.email(),
  PAYPAL_SANDBOX_PAYER_EMAIL: z.email(),
  PAYPAL_SANDBOX_PAYEE_EMAIL: z.email(),
  PAYPAL_WEBHOOK_ID: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
});

export type SandboxEnv = z.infer<typeof sandboxEnvSchema>;

export const requiredSandboxEnvKeys = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PLATFORM_PAYPAL_EMAIL",
  "PAYPAL_SANDBOX_PAYER_EMAIL",
  "PAYPAL_SANDBOX_PAYEE_EMAIL",
] as const;

export type SandboxEnvResult =
  { ok: true; env: SandboxEnv } | { ok: false; missing: string[]; invalid: string[] };

/** Lists required keys that are absent or blank (names only — never values). */
export function missingSandboxEnvKeys(source: Record<string, string | undefined>): string[] {
  return requiredSandboxEnvKeys.filter((key) => {
    const value = source[key];

    return value === undefined || value.trim() === "";
  });
}

/** Validates the sandbox env without throwing. */
export function readSandboxEnv(source: Record<string, string | undefined>): SandboxEnvResult {
  const missing = missingSandboxEnvKeys(source);
  if (missing.length > 0) {
    return { ok: false, missing, invalid: [] };
  }

  const parsed = sandboxEnvSchema.safeParse(source);
  if (!parsed.success) {
    return {
      ok: false,
      missing: [],
      invalid: parsed.error.issues.map((issue) => issue.path.join(".")),
    };
  }

  return { ok: true, env: parsed.data };
}

/** `YYYY-MM-DD` that PayPal's `payment_term.due_date` expects. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
