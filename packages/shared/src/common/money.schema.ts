import { z } from "zod";

/**
 * Money is always a non-negative integer number of cents (AGENTS.md invariant
 * #4). Never use floats for money in the domain.
 */
export const moneyCentsSchema = z.number().int().nonnegative().safe();

export type MoneyCents = z.infer<typeof moneyCentsSchema>;

const currencySymbols: Record<"USD", string> = {
  USD: "$",
};

/**
 * Formats integer cents for display at the edge.
 *
 * `formatCents(1234, "USD") === "$12.34"`, `formatCents(-150, "USD") === "-$1.50"`.
 * Throws a `RangeError` for non-integer or unsafe-integer input.
 */
export function formatCents(cents: number, currency: "USD"): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`formatCents expects a safe integer number of cents, received ${cents}`);
  }

  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = (absolute % 100).toString().padStart(2, "0");

  return `${sign}${currencySymbols[currency]}${whole}.${fraction}`;
}
