import { describe, expect, test } from "bun:test";
import type { AuthConfigPayload } from "../../src/auth/auth.types";
import { safeNextPath } from "../../src/auth/auth-redirect";
import {
  authConfigSchema,
  demoLoginStatusSchema,
  signInSchema,
  signUpSchema,
} from "../../src/auth/auth.schema";

describe("signInSchema", () => {
  test("trims the email and accepts a valid pair", () => {
    const parsed = signInSchema.parse({ email: "  organizer@demo.kitty ", password: "hunter2" });

    expect(parsed.email).toBe("organizer@demo.kitty");
  });

  test("rejects an invalid email", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "hunter2" });

    expect(result.success).toBe(false);
  });

  test("rejects an empty password with a readable message", () => {
    const result = signInSchema.safeParse({ email: "organizer@demo.kitty", password: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter your password");
    }
  });
});

describe("signUpSchema", () => {
  test("requires a name and a password of at least 8 characters", () => {
    const result = signUpSchema.safeParse({
      name: "A",
      email: "judge@kitty.demo",
      password: "short",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        "Enter your name",
        "Use at least 8 characters",
      ]);
    }
  });

  test("accepts a valid sign-up payload", () => {
    const parsed = signUpSchema.parse({
      name: "Mai",
      email: "mai@example.com",
      password: "correct-horse",
    });

    expect(parsed.name).toBe("Mai");
  });
});

describe("demoLoginStatusSchema", () => {
  test("accepts the enabled flag", () => {
    expect(demoLoginStatusSchema.parse({ enabled: true })).toEqual({ enabled: true });
    expect(demoLoginStatusSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  test("rejects anything that is not a boolean flag", () => {
    expect(demoLoginStatusSchema.safeParse({ enabled: "true" }).success).toBe(false);
    expect(demoLoginStatusSchema.safeParse({}).success).toBe(false);
  });
});

describe("authConfigSchema", () => {
  test("requires the deployment capability flags", () => {
    const valid: AuthConfigPayload = {
      emailPassword: true,
      providers: ["github", "paypal"],
      demo: false,
      emailVerification: true,
      passwordReset: false,
    };

    expect(authConfigSchema.parse(valid)).toEqual(valid);
  });

  test("rejects a payload without passwordReset", () => {
    const result = authConfigSchema.safeParse({
      emailPassword: true,
      providers: [],
      demo: false,
      emailVerification: false,
    });

    expect(result.success).toBe(false);
  });

  test("rejects an unknown provider id", () => {
    const result = authConfigSchema.safeParse({
      emailPassword: true,
      providers: ["myspace"],
      demo: false,
      emailVerification: false,
      passwordReset: true,
    });

    expect(result.success).toBe(false);
  });
});

describe("safeNextPath", () => {
  test("keeps same-origin paths", () => {
    expect(safeNextPath("/events/evt_1/approvals")).toBe("/events/evt_1/approvals");
  });

  test("rejects open-redirect attempts", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});
