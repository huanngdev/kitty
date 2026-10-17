import { describe, expect, test } from "bun:test";
import { demoLoginErrorMessage, readAuthErrorMessage } from "./auth-error";

describe("readAuthErrorMessage", () => {
  test("prefers the Better Auth message", () => {
    expect(readAuthErrorMessage({ message: "Invalid email or password" }, "fallback")).toBe(
      "Invalid email or password",
    );
  });

  test("falls back to statusText", () => {
    expect(readAuthErrorMessage({ message: "  ", statusText: "Unauthorized" }, "fallback")).toBe(
      "Unauthorized",
    );
  });

  test("uses the fallback for unknown shapes", () => {
    expect(readAuthErrorMessage(null, "fallback")).toBe("fallback");
    expect(readAuthErrorMessage("boom", "fallback")).toBe("fallback");
    expect(readAuthErrorMessage({}, "fallback")).toBe("fallback");
  });
});

describe("demoLoginErrorMessage", () => {
  test("explains an unavailable demo account", () => {
    expect(demoLoginErrorMessage("DEMO_LOGIN_NOT_CONFIGURED")).toContain("isn't available");
    expect(demoLoginErrorMessage("DEMO_LOGIN_FAILED")).toContain("Sign in with your email");
  });

  test("explains a disabled or rate-limited demo login", () => {
    expect(demoLoginErrorMessage("DEMO_LOGIN_DISABLED")).toContain("turned off");
    expect(demoLoginErrorMessage("RATE_LIMITED")).toContain("Too many demo sign-in attempts");
  });

  test("has a generic fallback", () => {
    expect(demoLoginErrorMessage(null)).toBe("Could not start the demo. Try again.");
  });
});
