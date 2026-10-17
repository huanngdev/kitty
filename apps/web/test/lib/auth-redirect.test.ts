import { describe, expect, test } from "bun:test";
import { resolveAuthRedirect } from "@/lib/auth-redirect";
import { buildSignInPath, readNextPath } from "@/lib/routes";

describe("resolveAuthRedirect", () => {
  test("sends signed-out visitors from the app area to sign-in with ?next", () => {
    expect(
      resolveAuthRedirect({
        pathname: "/events/evt_123/approvals",
        search: "?filter=pending",
        hasSessionCookie: false,
      }),
    ).toEqual({
      redirectTo: "/sign-in?next=%2Fevents%2Fevt_123%2Fapprovals%3Ffilter%3Dpending",
    });
  });

  test("leaves signed-out visitors on public routes", () => {
    expect(resolveAuthRedirect({ pathname: "/", hasSessionCookie: false })).toBeNull();
  });

  test("sends signed-in visitors away from sign-in/sign-up", () => {
    expect(resolveAuthRedirect({ pathname: "/sign-in", hasSessionCookie: true })).toEqual({
      redirectTo: "/events",
    });
    expect(resolveAuthRedirect({ pathname: "/sign-up", hasSessionCookie: true })).toEqual({
      redirectTo: "/events",
    });
  });

  test("does not treat a lookalike prefix as protected", () => {
    expect(
      resolveAuthRedirect({ pathname: "/events-archive", hasSessionCookie: false }),
    ).toBeNull();
  });
});

describe("buildSignInPath", () => {
  test("omits unsafe next paths", () => {
    expect(buildSignInPath("//evil.example")).toBe("/sign-in");
    expect(buildSignInPath(undefined)).toBe("/sign-in");
  });

  test("keeps a safe next path", () => {
    expect(buildSignInPath("/events/new")).toBe("/sign-in?next=%2Fevents%2Fnew");
  });
});

describe("readNextPath", () => {
  test("reads a string next param", () => {
    expect(readNextPath({ next: "/events/evt_1" })).toBe("/events/evt_1");
  });

  test("ignores arrays and unsafe values", () => {
    expect(readNextPath({ next: ["/events", "/settings"] })).toBeNull();
    expect(readNextPath({ next: "https://evil.example" })).toBeNull();
    expect(readNextPath({})).toBeNull();
  });
});
