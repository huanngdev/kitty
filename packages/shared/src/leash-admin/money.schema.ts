import { z } from "zod";

/**
 * Money wire format (AGENTS.md invariant #4): a decimal string with exactly two
 * fraction digits, e.g. `"2500.00"`. Inside the gateway it is parsed to integer
 * cents with `@kitty/ledger` `parseMoney` / formatted back with `formatMoney`;
 * floats are never used for money.
 *
 * The regex mirrors `@kitty/ledger` `parseMoney`: no sign, no exponent, no
 * whitespace, exactly two decimals.
 */
export const moneyWireSchema = z.string().regex(/^\d+\.\d{2}$/, {
  error: 'expected a decimal money string like "12.34"',
});

export type MoneyWire = z.infer<typeof moneyWireSchema>;

/**
 * Signed money wire format, used by the ledger feed where a line is negative
 * when it leaves an account (`"−12.34"`). Mirrors `formatMoney` output.
 */
export const signedMoneyWireSchema = z.string().regex(/^-?\d+\.\d{2}$/, {
  error: 'expected a signed decimal money string like "-12.34"',
});

export type SignedMoneyWire = z.infer<typeof signedMoneyWireSchema>;
