/**
 * OAuth provider integration tests against a local mock OAuth2/OIDC server.
 *
 * GitHub and PayPal cannot be driven for real in CI, so this suite registers a
 * `genericOAuth` provider **only in the test** and points it at
 * `oauth2-mock-server`. It covers the four flows that matter for the linking
 * policy (ADR-029):
 *
 *   1. a brand-new user signs up through the provider;
 *   2. an existing, locally verified user is auto-linked when the provider says
 *      the email is verified;
 *   3. NO auto-link when the provider does not verify the email;
 *   4. an error from the provider lands on the friendly error URL.
 *
 * The real `github`/`paypal` provider config built from env is covered by unit
 * tests (test/lib/auth-config.test.ts).
 *
 * NOT part of `bun run ci`: needs `apps/api/.env` (real Neon dev database).
 *
 *   bun run --filter api test:integration
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { OAuth2Server } from "oauth2-mock-server";
import { genericOAuth } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { account, user } from "@kitty/db/schema";
import { createAuth, type Auth } from "../../src/lib/auth";
import { env } from "../../src/env";
import { getDb } from "../../src/lib/db";

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const origin = env.WEB_ORIGIN ?? "http://localhost:3000";
const createdEmails: string[] = [];

interface Claims {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}

let server: OAuth2Server;
let auth: Auth;
let currentClaims: Claims;
/** Unique client IP per request: Better Auth rate-limits /sign-in per IP. */
let requestCounter = 0;

function nextIp(): string {
  requestCounter += 1;

  return `10.9.${runId.length}.${(requestCounter % 250) + 1}`;
}

beforeAll(async () => {
  server = new OAuth2Server();
  await server.issuer.keys.generate("RS256");
  await server.start(0, "127.0.0.1");

  const base = `http://127.0.0.1:${server.address().port}`;

  auth = createAuth({
    // Trust the mock provider in this suite so the unverified-email case is
    // rejected by OUR `validateUserInfo` guard (ADR-029), not by Better Auth's
    // generic "untrusted provider" check.
    trustedProviders: ["github", "paypal", "mock"],
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: "mock",
            clientId: "mock-client",
            clientSecret: "mock-secret",
            authorizationUrl: `${base}/authorize`,
            tokenUrl: `${base}/token`,
            userInfoUrl: `${base}/userinfo`,
            scopes: ["openid", "email", "profile"],
            // The mock's /userinfo response is not the thing under test here
            // (the linking policy is), so read the claims straight from the
            // mutable fixture instead of depending on the endpoint's token
            // validation.
            getUserInfo: async () => ({
              id: currentClaims.sub,
              sub: currentClaims.sub,
              name: currentClaims.name,
              email: currentClaims.email,
              emailVerified: currentClaims.email_verified,
              email_verified: currentClaims.email_verified,
            }),
            accountSubject: ({ profile }) => String(profile["sub"] ?? profile["id"] ?? ""),
          },
        ],
      }),
    ],
  });
});

afterAll(async () => {
  const db = getDb();
  for (const address of createdEmails) {
    await db.execute(sql`delete from app."user" where email = ${address}`);
  }
  await server.stop();
});

interface Started {
  authorizeUrl: string;
  state: string;
  cookies: string;
}

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .filter((cookie) => cookie.length > 0)
    .join("; ");
}

/** Starts `/sign-in/social` and returns the provider URL plus the state cookie. */
async function startSignIn(input: {
  callbackURL: string;
  errorCallbackURL: string;
}): Promise<Started> {
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-forwarded-for": nextIp(),
      },
      body: JSON.stringify({
        provider: "mock",
        callbackURL: input.callbackURL,
        errorCallbackURL: input.errorCallbackURL,
        disableRedirect: true,
      }),
    }),
  );

  if (response.status !== 200) {
    throw new Error(`sign-in/social failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { url?: string };

  if (payload.url === undefined) {
    throw new Error(`no authorization url in ${JSON.stringify(payload)}`);
  }

  const authorizeUrl = new URL(payload.url);
  const state = authorizeUrl.searchParams.get("state");

  if (state === null) {
    throw new Error("no state in authorization url");
  }

  return { authorizeUrl: payload.url, state, cookies: cookiesFrom(response) };
}

/** Plays the provider: gets a code from the mock server for the authorize URL. */
async function authorizationCode(authorizeUrl: string): Promise<string> {
  const response = await fetch(authorizeUrl, { redirect: "manual" });
  const location = response.headers.get("location");

  if (location === null) {
    throw new Error(`provider did not redirect (status ${response.status})`);
  }

  const code = new URL(location, "http://provider.test").searchParams.get("code");

  if (code === null) {
    throw new Error(`no code in provider redirect ${location}`);
  }

  return code;
}

async function finishCallback(input: {
  code?: string;
  state: string;
  cookies: string;
  error?: string;
}): Promise<Response> {
  const params = new URLSearchParams();

  if (input.code !== undefined) params.set("code", input.code);
  if (input.error !== undefined) params.set("error", input.error);
  params.set("state", input.state);

  return auth.handler(
    new Request(`${origin}/api/auth/callback/mock?${params.toString()}`, {
      headers: { cookie: input.cookies, "x-forwarded-for": nextIp() },
      redirect: "manual",
    }),
  );
}

async function linkCountFor(email: string): Promise<number> {
  const db = getDb();
  const [localUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);

  if (localUser === undefined) return 0;

  const rows = await db.select().from(account).where(eq(account.userId, localUser.id));

  return rows.filter((row) => row.providerId === "mock").length;
}

async function createVerifiedLocalUser(email: string, password: string): Promise<void> {
  createdEmails.push(email);
  await auth.api.signUpEmail({
    body: { name: "Local User", email, password },
  });
  await getDb().update(user).set({ emailVerified: true }).where(eq(user.email, email));
}

describe("OAuth through the mock provider", () => {
  test("a brand-new user is created and signed in", async () => {
    const email = `oauth-new-${runId}@kitty.test`;
    createdEmails.push(email);
    currentClaims = { sub: `sub-new-${runId}`, email, email_verified: true, name: "New User" };

    const started = await startSignIn({
      callbackURL: `${origin}/events`,
      errorCallbackURL: `${origin}/auth/error`,
    });
    const code = await authorizationCode(started.authorizeUrl);
    const response = await finishCallback({ code, state: started.state, cookies: started.cookies });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/events");
    expect(cookiesFrom(response)).toContain("kitty.session_token");

    const [row] = await getDb().select().from(user).where(eq(user.email, email)).limit(1);
    expect(row?.name).toBe("New User");
    expect(await linkCountFor(email)).toBe(1);
  });

  test("auto-links when the provider verifies the email", async () => {
    const email = `oauth-link-${runId}@kitty.test`;
    await createVerifiedLocalUser(email, "Local-Password-1");
    currentClaims = { sub: `sub-link-${runId}`, email, email_verified: true, name: "Linked User" };

    const started = await startSignIn({
      callbackURL: `${origin}/events`,
      errorCallbackURL: `${origin}/auth/error`,
    });
    const code = await authorizationCode(started.authorizeUrl);
    const response = await finishCallback({ code, state: started.state, cookies: started.cookies });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/events");
    expect(await linkCountFor(email)).toBe(1);
  });

  test("does NOT auto-link when the provider email is unverified", async () => {
    const email = `oauth-unverified-${runId}@kitty.test`;
    await createVerifiedLocalUser(email, "Local-Password-2");
    currentClaims = {
      sub: `sub-unverified-${runId}`,
      email,
      email_verified: false,
      name: "Sneaky",
    };

    const started = await startSignIn({
      callbackURL: `${origin}/events`,
      errorCallbackURL: `${origin}/auth/error`,
    });
    const code = await authorizationCode(started.authorizeUrl);
    const response = await finishCallback({ code, state: started.state, cookies: started.cookies });

    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";

    expect(location).toContain("/auth/error");
    expect(location).toContain("provider_email_not_verified");
    expect(await linkCountFor(email)).toBe(0);
  });

  test("a provider error lands on the friendly error page", async () => {
    const started = await startSignIn({
      callbackURL: `${origin}/events`,
      errorCallbackURL: `${origin}/auth/error`,
    });
    const response = await finishCallback({
      state: started.state,
      cookies: started.cookies,
      error: "access_denied",
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";

    expect(location).toContain("/auth/error");
    expect(location).toContain("access_denied");
  });
});
