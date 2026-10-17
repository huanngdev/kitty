/**
 * Money helpers for the ledger.
 *
 * Inside the domain money is always an integer number of cents (`bigint`) —
 * AGENTS.md invariant #4. Decimal strings are the **wire format** used at the
 * edges only (API payloads, UI, PayPal), never for arithmetic.
 */

/**
 * Wire format: `<integer>.<exactly 2 digits>`, for example `"12.34"`.
 * No sign, no exponent, no whitespace, no more or fewer decimals.
 */
const moneyWirePattern = /^\d+\.\d{2}$/;

/**
 * Thrown by {@link parseMoney} when a string is not a valid money wire value.
 */
export class MoneyFormatError extends Error {
  readonly code = "MONEY_FORMAT";
  readonly value: string;

  constructor(value: string, reason: string) {
    super(`Invalid money value ${JSON.stringify(value)}: ${reason}`);
    this.name = "MoneyFormatError";
    this.value = value;
  }
}

/**
 * Thrown by {@link assertNonNegative} when a cents value is negative.
 */
export class NegativeMoneyError extends Error {
  readonly code = "NEGATIVE_MONEY";
  readonly cents: bigint;

  constructor(cents: bigint, context: string) {
    super(`${context} must be a non-negative number of cents, received ${cents.toString()}`);
    this.name = "NegativeMoneyError";
    this.cents = cents;
  }
}

/** Zero cents, so callers never write a bare `0n` for money. */
export const ZERO_CENTS: bigint = 0n;

/**
 * Parses a money wire string into integer cents.
 *
 * Only `^\d+\.\d{2}$` is accepted, so negatives, exponents, thousands
 * separators, whitespace and wrong decimal counts are rejected with a
 * {@link MoneyFormatError}. `parseMoney("12.34") === 1234n`.
 *
 * Leading zeros are accepted by the pattern (`"0012.34"` is `1234n`) but
 * {@link formatMoney} always emits the canonical form, so the round-trip
 * identity `formatMoney(parseMoney(value)) === value` holds for every
 * canonical wire string.
 */
export function parseMoney(value: string): bigint {
  if (!moneyWirePattern.test(value)) {
    throw new MoneyFormatError(value, 'expected "<integer>.<2 digits>" with no sign or whitespace');
  }

  const [whole = "", fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction);
}

/**
 * Formats integer cents as a money wire string.
 *
 * `formatMoney(1234n) === "12.34"`, `formatMoney(-5n) === "-0.05"`.
 * `parseMoney(formatMoney(cents)) === cents` holds for every `bigint`.
 */
export function formatMoney(cents: bigint): string {
  const negative = cents < ZERO_CENTS;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  const sign = negative ? "-" : "";

  return `${sign}${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
}

/**
 * Asserts that a cents value is not negative, throwing a
 * {@link NegativeMoneyError} (carrying `context`) otherwise.
 */
export function assertNonNegative(cents: bigint, context: string): void {
  if (cents < ZERO_CENTS) {
    throw new NegativeMoneyError(cents, context);
  }
}
