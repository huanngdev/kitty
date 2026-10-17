import { describe, expect, test } from "bun:test";
import { initialsFromName } from "@/features/shell/lib/initials";

describe("initialsFromName", () => {
  test("uses the first and last word", () => {
    expect(initialsFromName("Mai Tran")).toBe("MT");
    expect(initialsFromName("Mai Linh Tran")).toBe("MT");
  });

  test("handles single names and extra whitespace", () => {
    expect(initialsFromName("  Mai  ")).toBe("M");
    expect(initialsFromName("")).toBe("?");
  });
});
