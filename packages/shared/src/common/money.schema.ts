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

/** Formats integer cents for display at the edge. `formatCents(1234, "USD") === "$12.34"`. */
export function formatCents(cents: number, currency: "USD"): string {
  const whole = Math.trunc(cents / 100);
  const fraction = Math.abs(cents % 100)
    .toString()
    .padStart(2, "0");

  return `${currencySymbols[currency]}${whole}.${fraction}`;
}
