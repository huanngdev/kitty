import { describe, expect, test } from "bun:test";
import {
  DEMO_BLOCKED_PATHS,
  RESET_REQUEST_PATHS,
  isDemoBlockedPath,
  isResetRequestPath,
  resolveGuardAction,
} from "../../src/lib/auth-guard";

describe("DEMO_BLOCKED_PATHS", () => {
  test("blocks every credential, linking and session-teardown endpoint", () => {
    const expected = [
      "/change-password",
      "/change-email",
      "/update-user",
      "/delete-user",
      "/unlink-account",
      "/link-social",
      "/revoke-sessions",
      "/revoke-other-sessions",
      "/revoke-session",
      "/set-password",
    ];

    for (const path of expected) {
      expect(DEMO_BLOCKED_PATHS as readonly string[]).toContain(path);
      expect(isDemoBlockedPath(path)).toBe(true);
    }
  });

  test("does not block unrelated endpoints", () => {
    for (const path of ["/sign-in/email", "/get-session", "/list-accounts", "/verify-email"]) {
      expect(isDemoBlockedPath(path)).toBe(false);
    }
  });
});

describe("RESET_REQUEST_PATHS", () => {
  test("covers both reset request routes", () => {
    expect(RESET_REQUEST_PATHS).toEqual(["/request-password-reset", "/forget-password"]);
    expect(isResetRequestPath("/request-password-reset")).toBe(true);
    expect(isResetRequestPath("/forget-password")).toBe(true);
    expect(isResetRequestPath("/reset-password")).toBe(false);
  });
});

describe("resolveGuardAction", () => {
  const blockedPaths = [
    "/change-password",
    "/change-email",
    "/update-user",
    "/delete-user",
    "/unlink-account",
    "/link-social",
    "/revoke-sessions",
    "/revoke-other-sessions",
    "/revoke-session",
    "/set-password",
  ];

  test("a demo session is read-only on every blocked path", () => {
    for (const path of blockedPaths) {
      expect(
        resolveGuardAction({
          path,
          passwordResetAvailable: true,
          sessionIsDemo: true,
          emailIsDemo: null,
        }).type,
      ).toBe("demo_read_only");
    }
  });

  test("a normal (or signed-out) session is allowed on the same paths", () => {
    for (const path of blockedPaths) {
      expect(
        resolveGuardAction({
          path,
          passwordResetAvailable: true,
          sessionIsDemo: false,
          emailIsDemo: null,
        }).type,
      ).toBe("allow");
      expect(
        resolveGuardAction({
          path,
          passwordResetAvailable: true,
          sessionIsDemo: null,
          emailIsDemo: null,
        }).type,
      ).toBe("allow");
    }
  });

  test("a reset for a demo address silently succeeds", () => {
    for (const path of RESET_REQUEST_PATHS) {
      expect(
        resolveGuardAction({
          path,
          passwordResetAvailable: true,
          sessionIsDemo: null,
          emailIsDemo: true,
        }).type,
      ).toBe("silent_reset_success");
    }
  });

  test("a reset for a normal address goes through", () => {
    expect(
      resolveGuardAction({
        path: "/request-password-reset",
        passwordResetAvailable: true,
        sessionIsDemo: null,
        emailIsDemo: false,
      }).type,
    ).toBe("allow");
  });

  test("every reset is silent when the deployment cannot send mail", () => {
    for (const emailIsDemo of [true, false, null]) {
      expect(
        resolveGuardAction({
          path: "/request-password-reset",
          passwordResetAvailable: false,
          sessionIsDemo: null,
          emailIsDemo,
        }).type,
      ).toBe("silent_reset_success");
    }
  });

  test("unknown paths are always allowed", () => {
    expect(
      resolveGuardAction({
        path: "/sign-in/email",
        passwordResetAvailable: false,
        sessionIsDemo: true,
        emailIsDemo: true,
      }).type,
    ).toBe("allow");
  });
});
