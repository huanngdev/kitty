import { describe, expect, test } from "bun:test";
import { parseEnv } from "../src/env";

const SECRET = "x".repeat(32);

const base = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/kitty",
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://localhost:3000",
  WEB_ORIGIN: "http://localhost:3000",
};

describe("env schema", () => {
  test("applies defaults so a bare env still parses", () => {
    const env = parseEnv({});

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(8787);
    expect(env.PAYPAL_LOGIN_ENV).toBe("sandbox");
    expect(env.DEMO_LOGIN_ENABLED).toBe(false);
    expect(env.AUTH_REQUIRE_EMAIL_VERIFICATION).toBeUndefined();
  });

  test("treats empty strings as unset", () => {
    const env = parseEnv({ ...base, GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" });

    expect(env.GITHUB_CLIENT_ID).toBeUndefined();
    expect(env.GITHUB_CLIENT_SECRET).toBeUndefined();
  });

  test("requires a 32-character BETTER_AUTH_SECRET when auth is configured", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "too-short" })).toThrow();
    expect(parseEnv(base).BETTER_AUTH_SECRET).toBe(SECRET);
  });

  test("rejects a half-configured provider or mailer", () => {
    expect(() => parseEnv({ ...base, GITHUB_CLIENT_ID: "id" })).toThrow(
      /GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set together/,
    );
    expect(() => parseEnv({ ...base, PAYPAL_LOGIN_CLIENT_SECRET: "secret" })).toThrow(
      /PAYPAL_LOGIN_CLIENT_ID and PAYPAL_LOGIN_CLIENT_SECRET must be set together/,
    );
    expect(() => parseEnv({ ...base, RESEND_API_KEY: "key" })).toThrow(
      /RESEND_API_KEY and MAIL_FROM must be set together/,
    );
  });

  test("accepts both login providers configured together", () => {
    const env = parseEnv({
      ...base,
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret",
      PAYPAL_LOGIN_CLIENT_ID: "pp-id",
      PAYPAL_LOGIN_CLIENT_SECRET: "pp-secret",
      PAYPAL_LOGIN_ENV: "live",
    });

    expect(env.GITHUB_CLIENT_ID).toBe("gh-id");
    expect(env.PAYPAL_LOGIN_ENV).toBe("live");
  });

  test("parses boolean flags from strings", () => {
    expect(parseEnv({ ...base, DEMO_LOGIN_ENABLED: "true" }).DEMO_LOGIN_ENABLED).toBe(true);
    expect(
      parseEnv({ ...base, AUTH_REQUIRE_EMAIL_VERIFICATION: "false" })
        .AUTH_REQUIRE_EMAIL_VERIFICATION,
    ).toBe(false);
  });
});
