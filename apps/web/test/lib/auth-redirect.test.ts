import { describe, expect, test } from "bun:test";
import { isAuthRoute, resolveAuthRedirect, resolveSignedInRedirect } from "@/lib/auth-redirect";
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

  test("does not treat a lookalike prefix as protected", () => {
    expect(
      resolveAuthRedirect({ pathname: "/events-archive", hasSessionCookie: false }),
    ).toBeNull();
  });

  test("no longer decides the auth screens from the cookie alone", () => {
    // A stale cookie still passes the optimistic check, so the proxy must not
    // redirect away from /sign-in before it has a validated session.
    expect(resolveAuthRedirect({ pathname: "/sign-in", hasSessionCookie: true })).toBeNull();
    expect(resolveAuthRedirect({ pathname: "/sign-up", hasSessionCookie: true })).toBeNull();
  });
});

describe("resolveSignedInRedirect", () => {
  test("sends a validated session away from sign-in/sign-up", () => {
    expect(resolveSignedInRedirect({ pathname: "/sign-in", hasValidSession: true })).toEqual({
      redirectTo: "/events",
    });
    expect(resolveSignedInRedirect({ pathname: "/sign-up", hasValidSession: true })).toEqual({
      redirectTo: "/events",
    });
  });

  test("keeps an invalid or stale cookie on the auth screen", () => {
    expect(resolveSignedInRedirect({ pathname: "/sign-in", hasValidSession: false })).toBeNull();
    expect(resolveSignedInRedirect({ pathname: "/sign-up", hasValidSession: false })).toBeNull();
  });

  test("never redirects the app area or public pages", () => {
    expect(resolveSignedInRedirect({ pathname: "/events", hasValidSession: true })).toBeNull();
    expect(resolveSignedInRedirect({ pathname: "/", hasValidSession: true })).toBeNull();
  });
});

describe("isAuthRoute", () => {
  test("matches only the signed-out-only screens", () => {
    expect(isAuthRoute("/sign-in")).toBeTrue();
    expect(isAuthRoute("/sign-up")).toBeTrue();
    expect(isAuthRoute("/sign-in/extra")).toBeFalse();
    expect(isAuthRoute("/events")).toBeFalse();
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

describe("open-redirect guard on ?next=", () => {
  const unsafe = [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "http://evil.example/events",
    "/%2F%2Fevil.example",
    "/%252F%252Fevil.example",
    "%2F%2Fevil.example",
    "javascript:alert(1)",
    "/events ",
    " /events",
  ];

  test("buildSignInPath drops every unsafe target", () => {
    for (const value of unsafe) {
      expect(buildSignInPath(value)).toBe("/sign-in");
    }
  });

  test("readNextPath drops every unsafe target", () => {
    for (const value of unsafe) {
      expect(readNextPath({ next: value })).toBeNull();
    }
  });

  test("keeps a safe same-origin path", () => {
    expect(buildSignInPath("/events/evt_1?tab=members")).toBe(
      "/sign-in?next=%2Fevents%2Fevt_1%3Ftab%3Dmembers",
    );
    expect(readNextPath({ next: "/settings/account" })).toBe("/settings/account");
  });
});
