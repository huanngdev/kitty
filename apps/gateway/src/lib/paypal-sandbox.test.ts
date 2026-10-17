import { describe, expect, test } from "bun:test";
import {
  isoDate,
  missingSandboxEnvKeys,
  readSandboxEnv,
  requiredSandboxEnvKeys,
} from "./paypal-sandbox";

const validSource: Record<string, string> = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "client-id",
  PAYPAL_CLIENT_SECRET: "client-secret",
  PLATFORM_PAYPAL_EMAIL: "platform@example.com",
  PAYPAL_SANDBOX_PAYER_EMAIL: "payer@example.com",
  PAYPAL_SANDBOX_PAYEE_EMAIL: "payee@example.com",
};

describe("missingSandboxEnvKeys", () => {
  test("lists every required name when nothing is set", () => {
    expect(missingSandboxEnvKeys({})).toEqual([...requiredSandboxEnvKeys]);
  });

  test("treats blank values as missing", () => {
    expect(missingSandboxEnvKeys({ ...validSource, PAYPAL_CLIENT_SECRET: "   " })).toEqual([
      "PAYPAL_CLIENT_SECRET",
    ]);
  });

  test("returns nothing for a complete env", () => {
    expect(missingSandboxEnvKeys(validSource)).toEqual([]);
  });
});

describe("readSandboxEnv", () => {
  test("parses a complete sandbox env", () => {
    const result = readSandboxEnv(validSource);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.PAYPAL_ENV).toBe("sandbox");
      expect(result.env.PAYPAL_SANDBOX_PAYER_EMAIL).toBe("payer@example.com");
      expect(result.env.PAYPAL_WEBHOOK_ID).toBeUndefined();
    }
  });

  test("defaults PAYPAL_ENV to sandbox", () => {
    const result = readSandboxEnv({
      PAYPAL_CLIENT_ID: "client-id",
      PAYPAL_CLIENT_SECRET: "client-secret",
      PLATFORM_PAYPAL_EMAIL: "platform@example.com",
      PAYPAL_SANDBOX_PAYER_EMAIL: "payer@example.com",
      PAYPAL_SANDBOX_PAYEE_EMAIL: "payee@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.PAYPAL_ENV).toBe("sandbox");
    }
  });

  test("reports missing names before validating values", () => {
    const result = readSandboxEnv({ PAYPAL_CLIENT_ID: "client-id" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("PAYPAL_CLIENT_SECRET");
      expect(result.invalid).toEqual([]);
    }
  });

  test("reports invalid emails by field name", () => {
    const result = readSandboxEnv({ ...validSource, PAYPAL_SANDBOX_PAYER_EMAIL: "not-an-email" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalid).toContain("PAYPAL_SANDBOX_PAYER_EMAIL");
    }
  });

  test("treats a blank optional PAYPAL_WEBHOOK_ID as unset", () => {
    const result = readSandboxEnv({ ...validSource, PAYPAL_WEBHOOK_ID: "" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.PAYPAL_WEBHOOK_ID).toBeUndefined();
    }
  });

  test("treats a blank PAYPAL_ENV as unset and falls back to sandbox", () => {
    const result = readSandboxEnv({ ...validSource, PAYPAL_ENV: "" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.PAYPAL_ENV).toBe("sandbox");
    }
  });
});

describe("isoDate", () => {
  test("formats a date as YYYY-MM-DD", () => {
    expect(isoDate(new Date("2026-11-20T10:30:00.000Z"))).toBe("2026-11-20");
  });
});
