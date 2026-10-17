import type { MiddlewareHandler } from "hono";
import type { AppEnv, AppVariables } from "../../src/middleware/session";

/**
 * Session fakes for the `apps/api` route tests: `app.request` needs a session
 * without a running Better Auth instance, so tests mount a middleware that sets
 * `c.var.user` / `c.var.session` directly.
 */

export type TestUser = NonNullable<AppVariables["user"]>;
export type TestSession = NonNullable<AppVariables["session"]>;

export function makeTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const base: TestUser = {
    id: "user_organizer_1",
    name: "Organizer",
    email: "organizer@example.com",
    emailVerified: true,
    image: null,
    isDemo: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  return { ...base, ...overrides };
}

export function makeTestSession(userId: string, overrides: Partial<TestSession> = {}): TestSession {
  const base: TestSession = {
    id: "session_1",
    token: "session-token",
    userId,
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ipAddress: null,
    userAgent: null,
  };

  return { ...base, ...overrides };
}

/** A middleware that signs the request in as `user` (or out when `null`). */
export function fakeSession(user: TestUser | null): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("user", user);
    c.set("session", user === null ? null : makeTestSession(user.id));
    c.set("event", null);
    await next();
  };
}
