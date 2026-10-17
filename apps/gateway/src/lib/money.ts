import { formatMoney, parseMoney } from "@kitty/ledger";
import { errorCodes } from "@kitty/shared";
import { AppError } from "./errors";

/**
 * Money edge helpers (AGENTS.md invariant #4): integer `bigint` cents inside
 * the gateway, a decimal string only on the wire. `parseMoney` / `formatMoney`
 * from `@kitty/ledger` are the only conversions allowed.
 */

/** Formats integer cents as the wire string `"1234"` → `"12.34"`. */
export function centsToWire(cents: bigint): string {
  return formatMoney(cents);
}

/**
 * Parses a wire money string into integer cents, mapping a format error to the
 * shared `VALIDATION_FAILED` shape.
 */
export function wireToCents(value: string, field: string): bigint {
  try {
    return parseMoney(value);
  } catch {
    throw new AppError(errorCodes.validationFailed, 400, {
      issues: [{ path: [field], message: 'expected a decimal money string like "12.34"' }],
    });
  }
}

/**
 * Converts a value coming back from a Postgres aggregate (`SUM` is `numeric`,
 * so the driver hands it over as a string, or `null` when the rows are empty)
 * into integer cents.
 */
export function toCents(value: unknown, context: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }

  throw new AppError(errorCodes.internal, 500, { context });
}
