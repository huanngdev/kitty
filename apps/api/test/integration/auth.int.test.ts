/**
 * Auth integration tests against the real Neon dev database (docs/18).
 *
 * NOT part of `bun run ci` — they need `apps/api/.env` (DATABASE_URL,
 * BETTER_AUTH_SECRET, BETTER_AUTH_URL, WEB_ORIGIN) and reach the network.
 *
 *   bun run --filter api test:integration
 *
 * They run against the `app` schema of the dev database and clean up the users
 * they create. Rate limiting is exercised with a unique x-forwarded-for per run
 * so a previous run can never make this one flaky.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { user } from "@kitty/db/schema";
import { app } from "../../src/app";
import { env } from "../../src/env";
import { getDb } from "../../src/lib/db";
import { consoleMailerSingleton } from "../../src/lib/mailer";

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const email = `auth-int-${runId}@kitty.test`;
const password = "Correct-Horse-1";
const newPassword = "Correct-Horse-2";
const secondPassword = "Correct-Horse-3";
const createdEmails: string[] = [email];
const ipFor = (suffix: string): string =>
  `10.${runId.length}.${suffix.length}.${suffix.charCodeAt(0)}`;

/**
 * A distinct client IP per request. Counters live in the database and repeated
 * local runs would otherwise start already rate limited.
 */
let requestCounter = 0;

function nextIp(): string {
  requestCounter += 1;

  return `10.${runId.length}.${(requestCounter % 200) + 1}.${(requestCounter % 250) + 1}`;
}

/**
 * A fresh IP per run for the rate-limit test: counters live in the database
 * (rateLimit.storage: "database"), so a fixed address would make the sixth
 * attempt from the *previous* run fail this one.
 */
function uniqueIp(): string {
  const hash = [...runId].reduce((total, character) => total + character.charCodeAt(0), 0);

  return `172.16.${hash % 250}.${(hash * 7) % 250}`;
}

interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly cookie?: string | null;
  readonly ip?: string;
}

async function authRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = new Headers();

  if (options.body !== undefined) headers.set("content-type", "application/json");
  headers.set("origin", env.WEB_ORIGIN ?? "http://localhost:3000");
  headers.set("x-forwarded-for", options.ip ?? nextIp());
  if (options.cookie !== undefined && options.cookie !== null && options.cookie.length > 0) {
    headers.set("cookie", options.cookie);
  }

  return app.request(`http://localhost${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    redirect: "manual",
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

/** Extracts the `name=value` part of one cookie from `Set-Cookie` headers. */
function sessionCookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie();

  for (const cookie of raw) {
    const [pair] = cookie.split(";");

    if (pair !== undefined && pair.startsWith("kitty.session_token=")) {
      return pair;
    }
  }

  throw new Error(`no session cookie in response: ${raw.join(" | ")}`);
}

function tokenFromLink(text: string): string {
  const match = /token=([^&\s]+)/.exec(text);

  if (match?.[1] === undefined) {
    throw new Error(`no token in link: ${text}`);
  }

  return decodeURIComponent(match[1]);
}

async function signUp(address: string, secret: string): Promise<string> {
  createdEmails.push(address);

  const response = await authRequest("/api/auth/sign-up/email", {
    body: { name: "Integration User", email: address, password: secret },
  });

  expect(response.status).toBe(200);

  return sessionCookieFrom(response);
}

afterAll(async () => {
  // Remove the users this run created (cascades to sessions/accounts).
  const db = getDb();
  for (const address of createdEmails) {
    await db.execute(sql`delete from app."user" where email = ${address}`);
  }
});

/**
 * HTTP-reachable endpoints a demo account may never call (ADR-029).
 * `/set-password` is also blocked, but Better Auth marks it `serverOnly` so it
 * has no HTTP route (the unit matrix in test/lib/auth-guard.test.ts covers it).
 */
const DEMO_BLOCKED_PATHS = [
  "/change-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/unlink-account",
  "/link-social",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/revoke-session",
] as const;

/** Creates a verified account and flags it as a demo (judge) account. */
async function createDemoUser(address: string, secret: string): Promise<string> {
  const cookie = await signUp(address, secret);

  await getDb()
    .update(user)
    .set({ isDemo: true, emailVerified: true })
    .where(eq(user.email, address));

  return cookie;
}

describe("email + password lifecycle", () => {
  test("sign-up sends a verification link the console mailer captured", async () => {
    await signUp(email, password);

    const captured = consoleMailerSingleton().lastFor(email);

    expect(captured?.subject).toBe("Verify your Kitty email");
    expect(captured?.text).toContain("/verify-email?token=");
    expect(captured?.text).not.toContain(password);
  });

  test("verification link marks the email verified", async () => {
    const captured = consoleMailerSingleton().lastFor(email);
    const token = tokenFromLink(captured?.text ?? "");

    const response = await authRequest(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);

    expect([200, 302]).toContain(response.status);

    const cookie = await signInAndGetCookie(email, password);
    const session = await authRequest("/api/auth/get-session", { cookie });

    expect(session.status).toBe(200);
    const payload: unknown = await session.json();
    expect(JSON.stringify(payload)).toContain('"emailVerified":true');
  });

  test("change password revokes every other session", async () => {
    const first = await signInAndGetCookie(email, password);
    const second = await signInAndGetCookie(email, password);

    const changed = await authRequest("/api/auth/change-password", {
      cookie: second,
      body: { currentPassword: password, newPassword: secondPassword, revokeOtherSessions: true },
    });

    expect(changed.status).toBe(200);

    const staleFirst = await authRequest("/api/auth/get-session", { cookie: first });
    expect(await staleFirst.json()).toBeNull();

    // The new password works (and Better Auth may also rotate the current
    // session token, which is why we do not reuse `second` here).
    const withNewPassword = await signInAndGetCookie(email, secondPassword);
    const stillValid = await authRequest("/api/auth/get-session", { cookie: withNewPassword });
    expect(await stillValid.json()).not.toBeNull();
  });

  test("reset password flow issues a working link and updates the password", async () => {
    consoleMailerSingleton().clear();

    const requested = await authRequest("/api/auth/request-password-reset", {
      body: { email, redirectTo: "/reset-password" },
    });

    expect(requested.status).toBe(200);

    const captured = consoleMailerSingleton().lastFor(email);
    expect(captured?.subject).toBe("Reset your Kitty password");

    const token = tokenFromLink(captured?.text ?? "");
    const reset = await authRequest("/api/auth/reset-password", {
      body: { newPassword, token },
    });

    expect(reset.status).toBe(200);

    const oldPassword = await authRequest("/api/auth/sign-in/email", {
      body: { email, password: secondPassword },
      ip: ipFor("old-password"),
    });
    expect(oldPassword.status).toBe(401);

    const works = await authRequest("/api/auth/sign-in/email", {
      body: { email, password: newPassword },
      ip: ipFor("new-password"),
    });
    expect(works.status).toBe(200);
  });

  test("the sixth sign-in attempt in a minute is rate limited", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await authRequest("/api/auth/sign-in/email", {
        body: { email, password: "definitely-wrong" },
        ip,
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe("demo guard", () => {
  const demoEmail = `auth-demo-${runId}@kitty.test`;
  const demoPassword = "Demo-Guard-1";

  test("a demo session gets 403 DEMO_READ_ONLY on every blocked path", async () => {
    const cookie = await createDemoUser(demoEmail, demoPassword);

    const errorBody = z.object({ code: z.string().optional() });

    for (const path of DEMO_BLOCKED_PATHS) {
      const response = await authRequest(`/api/auth${path}`, { cookie, body: {} });
      const text = await response.text();
      const parsed = text.length === 0 ? null : errorBody.safeParse(JSON.parse(text));
      const code = parsed?.success === true ? (parsed.data.code ?? "") : "";

      expect(`${path} ${response.status} ${code}`).toBe(`${path} 403 DEMO_READ_ONLY`);
    }
  });

  test("a normal user is not blocked on those paths", async () => {
    const cookie = await signInAndGetCookie(email, newPassword);

    for (const path of ["/revoke-sessions", "/revoke-other-sessions", "/update-user"]) {
      const response = await authRequest(`/api/auth${path}`, { cookie, body: {} });

      expect(`${path} ${response.status}`).not.toContain("403");
    }
  });

  test("a reset request for a demo address is silent and sends no email", async () => {
    consoleMailerSingleton().clear();

    const response = await authRequest("/api/auth/request-password-reset", {
      body: { email: demoEmail, redirectTo: "/reset-password" },
      ip: ipFor("demo-reset"),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status?: boolean; message?: string };

    expect(payload.status).toBe(true);
    expect(payload.message).toContain("If this email exists");
    // Same answer as an unknown address — and nothing was sent.
    expect(consoleMailerSingleton().lastFor(demoEmail)).toBeUndefined();
    expect(consoleMailerSingleton().all()).toHaveLength(0);
  });

  test("a reset request for a normal address still sends", async () => {
    consoleMailerSingleton().clear();

    const response = await authRequest("/api/auth/request-password-reset", {
      body: { email, redirectTo: "/reset-password" },
      ip: ipFor("normal-reset"),
    });

    expect(response.status).toBe(200);
    expect(consoleMailerSingleton().lastFor(email)?.subject).toBe("Reset your Kitty password");
  });
});

async function signInAndGetCookie(address: string, secret: string): Promise<string> {
  const response = await authRequest("/api/auth/sign-in/email", {
    body: { email: address, password: secret },
    ip: `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
  });

  expect(response.status).toBe(200);

  return sessionCookieFrom(response);
}
