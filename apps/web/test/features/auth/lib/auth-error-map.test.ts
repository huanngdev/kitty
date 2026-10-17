import { describe, expect, test } from "bun:test";
import {
  authErrorCode,
  describeAuthError,
  oauthErrorMessage,
} from "@/features/auth/lib/auth-error";

describe("describeAuthError", () => {
  test("maps invalid credentials", () => {
    const info = describeAuthError({
      status: 401,
      error: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });

    expect(info.kind).toBe("invalid_credentials");
    expect(info.message).toBe("Email or password is incorrect.");
  });

  test("maps an unverified email", () => {
    const info = describeAuthError({ status: 403, code: "EMAIL_NOT_VERIFIED" });

    expect(info.kind).toBe("email_not_verified");
    expect(info.message).toContain("Verify your email");
  });

  test("maps an existing account to the link hint", () => {
    for (const code of [
      "USER_ALREADY_EXISTS",
      "ACCOUNT_NOT_LINKED",
      "provider_email_not_verified",
    ]) {
      const info = describeAuthError({ code });

      expect(info.kind).toBe("account_exists");
      expect(info.message).toContain("link this provider from Settings");
    }
  });

  test("maps rate limiting with retry-after", () => {
    const withHeader = describeAuthError({ status: 429 }, { retryAfterSeconds: 42 });
    const withoutHeader = describeAuthError({ status: 429 });

    expect(withHeader.kind).toBe("rate_limited");
    expect(withHeader.message).toContain("42 seconds");
    expect(withoutHeader.message).toContain("a minute");
  });

  test("maps invalid/expired reset tokens", () => {
    expect(describeAuthError({ code: "INVALID_TOKEN" }).kind).toBe("invalid_token");
    expect(describeAuthError({ code: "TOKEN_EXPIRED" }).message).toContain("expired");
  });

  test("maps a stale session and the read-only demo account", () => {
    expect(describeAuthError({ code: "SESSION_NOT_FRESH" }).kind).toBe("session_not_fresh");
    expect(describeAuthError({ code: "DEMO_READ_ONLY" }).kind).toBe("demo_read_only");
  });

  test("never echoes the submitted password or email", () => {
    const info = describeAuthError({ message: "super-secret-input" }, { fallback: "Try again." });

    expect(info.message).not.toContain("super-secret-input");
  });

  test("falls back for unknown shapes", () => {
    expect(describeAuthError(null, { fallback: "Try again." }).message).toBe("Try again.");
  });
});

describe("authErrorCode", () => {
  test("reads a top-level or nested code", () => {
    expect(authErrorCode({ code: "X" })).toBe("X");
    expect(authErrorCode({ error: { code: "Y" } })).toBe("Y");
    expect(authErrorCode({})).toBeNull();
    expect(authErrorCode("nope")).toBeNull();
  });
});

describe("oauthErrorMessage", () => {
  test("explains the link hint for an existing account", () => {
    expect(oauthErrorMessage("account_not_linked")).toContain("link this provider");
  });

  test("explains a cancelled flow and an expired state", () => {
    expect(oauthErrorMessage("access_denied")).toContain("cancelled");
    expect(oauthErrorMessage("state_mismatch")).toContain("expired");
  });

  test("has a generic fallback", () => {
    expect(oauthErrorMessage(null)).toContain("couldn't finish");
    expect(oauthErrorMessage("something_new")).toContain("couldn't finish");
  });
});
