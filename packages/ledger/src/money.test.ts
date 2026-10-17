import { describe, expect, test } from "bun:test";
import {
  MoneyFormatError,
  NegativeMoneyError,
  ZERO_CENTS,
  assertNonNegative,
  formatMoney,
  parseMoney,
} from "./money";

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error("expected the call to throw");
}

describe("parseMoney", () => {
  test("parses the wire format into bigint cents", () => {
    expect(parseMoney("0.00")).toBe(0n);
    expect(parseMoney("0.01")).toBe(1n);
    expect(parseMoney("12.34")).toBe(1234n);
    expect(parseMoney("120.00")).toBe(12000n);
    expect(parseMoney("99999999.99")).toBe(9999999999n);
    expect(parseMoney("567.89")).toBe(56789n);
  });

  test("accepts non-canonical leading zeros of the same shape", () => {
    expect(parseMoney("000.00")).toBe(0n);
    expect(parseMoney("0012.34")).toBe(1234n);
  });

  test("handles amounts far beyond the safe integer range", () => {
    expect(parseMoney("123456789012345678901234567890.12")).toBe(12345678901234567890123456789012n);
  });

  test.each(["-1.00", "-0.01", "+1.00", "1", "1.", ".50", "1.0", "1.000", "1e2", "1.00 ", " 1.00"])(
    "rejects %p",
    (value) => {
      expect(() => parseMoney(value)).toThrow(MoneyFormatError);
    },
  );

  test.each(["1,000.00", "abc", "", "$1.00", "NaN"])("rejects %p", (value) => {
    expect(() => parseMoney(value)).toThrow(MoneyFormatError);
  });

  test("throws a typed error carrying the rejected value", () => {
    const error = captureError(() => parseMoney("1.5"));
    expect(error).toBeInstanceOf(MoneyFormatError);

    if (!(error instanceof MoneyFormatError)) {
      throw new Error("expected a MoneyFormatError");
    }

    expect(error.name).toBe("MoneyFormatError");
    expect(error.code).toBe("MONEY_FORMAT");
    expect(error.value).toBe("1.5");
    expect(error.message).toContain("1.5");
    expect(error.message).toContain("2 digits");
  });
});

describe("formatMoney", () => {
  test("formats cents with two decimals", () => {
    expect(formatMoney(ZERO_CENTS)).toBe("0.00");
    expect(formatMoney(1n)).toBe("0.01");
    expect(formatMoney(5n)).toBe("0.05");
    expect(formatMoney(100n)).toBe("1.00");
    expect(formatMoney(1234n)).toBe("12.34");
    expect(formatMoney(100000n)).toBe("1000.00");
  });

  test("formats negative cents with a leading minus", () => {
    expect(formatMoney(-1n)).toBe("-0.01");
    expect(formatMoney(-5n)).toBe("-0.05");
    expect(formatMoney(-1234n)).toBe("-12.34");
    expect(formatMoney(-100000n)).toBe("-1000.00");
  });
});

describe("assertNonNegative", () => {
  test("returns for zero and positive amounts", () => {
    expect(() => assertNonNegative(ZERO_CENTS, "allocationCents")).not.toThrow();
    expect(() => assertNonNegative(1n, "allocationCents")).not.toThrow();
  });

  test("throws a typed error that names the context", () => {
    const error = captureError(() => assertNonNegative(-1n, "allocationCents"));
    expect(error).toBeInstanceOf(NegativeMoneyError);

    if (!(error instanceof NegativeMoneyError)) {
      throw new Error("expected a NegativeMoneyError");
    }

    expect(error.name).toBe("NegativeMoneyError");
    expect(error.code).toBe("NEGATIVE_MONEY");
    expect(error.cents).toBe(-1n);
    expect(error.message).toContain("allocationCents");
    expect(error.message).toContain("-1");
  });
});
