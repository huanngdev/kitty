import { describe, expect, test } from "bun:test";
import { formatCents, moneyCentsSchema } from "../../src/common/money.schema";

describe("moneyCentsSchema", () => {
  test("accepts non-negative integer cents", () => {
    expect(moneyCentsSchema.safeParse(0).success).toBe(true);
    expect(moneyCentsSchema.safeParse(1234).success).toBe(true);
  });

  test("rejects negative, fractional and unsafe values", () => {
    expect(moneyCentsSchema.safeParse(-1).success).toBe(false);
    expect(moneyCentsSchema.safeParse(12.5).success).toBe(false);
    expect(moneyCentsSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });
});

describe("formatCents", () => {
  test("formats whole and fractional amounts as USD", () => {
    expect(formatCents(0, "USD")).toBe("$0.00");
    expect(formatCents(5, "USD")).toBe("$0.05");
    expect(formatCents(1234, "USD")).toBe("$12.34");
  });

  test("formats negative amounts with a leading minus sign", () => {
    expect(formatCents(-50, "USD")).toBe("-$0.50");
    expect(formatCents(-150, "USD")).toBe("-$1.50");
    expect(formatCents(-100000, "USD")).toBe("-$1000.00");
  });

  test("throws a RangeError for non-integer or unsafe input", () => {
    expect(() => formatCents(1.5, "USD")).toThrow(RangeError);
    expect(() => formatCents(Number.MAX_SAFE_INTEGER + 1, "USD")).toThrow(RangeError);
  });
});
