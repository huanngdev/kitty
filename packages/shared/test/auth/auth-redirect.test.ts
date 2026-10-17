import { describe, expect, test } from "bun:test";
import {
  buildCallbackUrl,
  passwordStrength,
  resolveNextPath,
  safeNextPath,
  signUpFormSchema,
} from "../../src/auth/index";

describe("safeNextPath", () => {
  test("keeps ordinary same-origin paths", () => {
    expect(safeNextPath("/events")).toBe("/events");
    expect(safeNextPath("/events?tab=members")).toBe("/events?tab=members");
    expect(safeNextPath("/settings/account#password")).toBe("/settings/account#password");
    expect(safeNextPath("/events/01JZ0000000000000000000000")).toBe(
      "/events/01JZ0000000000000000000000",
    );
  });

  test("rejects absolute and scheme-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("http://evil.example/path")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("///evil.example")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("data:text/html,hi")).toBeNull();
  });

  test("rejects slash-backslash tricks", () => {
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("\\\\evil.example")).toBeNull();
    expect(safeNextPath("/events\\..\\evil")).toBeNull();
  });

  test("rejects encoded variants, including double encoding", () => {
    expect(safeNextPath("/%2F%2Fevil.example")).toBeNull();
    expect(safeNextPath("/%252F%252Fevil.example")).toBeNull();
    expect(safeNextPath("%2F%2Fevil.example")).toBeNull();
    expect(safeNextPath("%252F%252Fevil.example")).toBeNull();
    expect(safeNextPath("/%5Cevil.example")).toBeNull();
    expect(safeNextPath("/%00evil")).toBeNull();
    expect(safeNextPath("/%E0%A4%A")).toBeNull();
  });

  test("rejects whitespace, control characters and empty values", () => {
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("   ")).toBeNull();
    expect(safeNextPath("/events ")).toBeNull();
    expect(safeNextPath(" /events")).toBeNull();
    expect(safeNextPath("/events\n")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  test("rejects absurdly long values", () => {
    expect(safeNextPath(`/${"a".repeat(3_000)}`)).toBeNull();
  });

  test("normalizes encoded characters inside a safe path", () => {
    expect(safeNextPath("/events%3Ftab%3Dmembers")).toBe("/events?tab=members");
  });
});

describe("resolveNextPath", () => {
  test("falls back when the value is unsafe", () => {
    expect(resolveNextPath("//evil.example", "/events")).toBe("/events");
    expect(resolveNextPath(undefined, "/events")).toBe("/events");
    expect(resolveNextPath("/settings/account", "/events")).toBe("/settings/account");
  });
});

describe("buildCallbackUrl", () => {
  test("only builds URLs on the app origin", () => {
    expect(buildCallbackUrl("https://kitty.example", "/events", "/events")).toBe(
      "https://kitty.example/events",
    );
    expect(buildCallbackUrl("https://kitty.example", "https://evil.example", "/events")).toBe(
      "https://kitty.example/events",
    );
    expect(buildCallbackUrl("https://kitty.example", "//evil.example", "/events")).toBe(
      "https://kitty.example/events",
    );
  });
});

describe("passwordStrength", () => {
  test("flags short passwords and grows with character classes", () => {
    expect(passwordStrength("short").label).toBe("too short");
    expect(passwordStrength("abcdefgh").score).toBe(1);
    expect(passwordStrength("abcdefg1").score).toBe(2);
    expect(passwordStrength("Abcdefg1").score).toBe(3);
    expect(passwordStrength("Abcdefgh1!xyz").score).toBe(4);
  });
});

describe("signUpFormSchema", () => {
  const valid = {
    name: "Mai",
    email: "mai@example.com",
    password: "correct-horse",
    confirmPassword: "correct-horse",
  };

  test("accepts matching passwords", () => {
    expect(signUpFormSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects mismatched passwords with a field error", () => {
    const result = signUpFormSchema.safeParse({ ...valid, confirmPassword: "different" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });
});
