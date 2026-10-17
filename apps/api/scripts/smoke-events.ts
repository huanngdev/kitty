#!/usr/bin/env bun
/**
 * KIT-30 integration smoke test (NOT part of CI).
 *
 * Exercises the real stack with `bun run dev` already running (api on :8787,
 * gateway on :8788) and the local `.env` files present:
 *
 *   sign up → POST /api/events (creates the gateway kitty) → add a member →
 *   add a vendor → verify the vendor (registers a gateway payee) → read the
 *   gateway's `GET /v1/kitties/:id/payees` back with the admin client.
 *
 * Run: `bun run --filter api smoke:events` (or
 * `bun --env-file=apps/api/.env apps/api/scripts/smoke-events.ts` from the repo
 * root). Never prints secrets.
 */
import { gatewayAdminClient } from "../src/lib/gateway-client";

const API_URL = process.env.API_URL ?? "http://localhost:8787";
const PASSWORD = "kitty-smoke-passphrase-123";
const RUN_ID = Date.now().toString(36);

interface SignUpResponse {
  readonly user?: { readonly id?: unknown };
}

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function pass(message: string): void {
  console.log(`PASS ${message}`);
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

async function main(): Promise<void> {
  const email = `smoke-${RUN_ID}@kitty.test`;

  // 1. Create a session through Better Auth.
  const signUp = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: "Smoke Organizer" }),
  });

  if (!signUp.ok) {
    fail(`sign-up returned ${signUp.status}`);
  }

  const signUpBody = (await readJson(signUp)) as SignUpResponse;
  const userId = typeof signUpBody.user?.id === "string" ? signUpBody.user.id : undefined;

  if (userId === undefined) {
    fail("sign-up response carried no user id");
  }

  const sessionCookie = signUp.headers.get("set-cookie")?.split(";")[0];

  if (sessionCookie === undefined || sessionCookie.length === 0) {
    fail("sign-up response carried no session cookie");
  }

  pass(`signed up as ${email}`);

  const apiFetch = (path: string, init: RequestInit = {}): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        cookie: sessionCookie,
        "content-type": "application/json",
      },
    });

  // 2. Create the event; the API should also create the gateway kitty.
  const eventResponse = await apiFetch("/api/events", {
    method: "POST",
    body: JSON.stringify({
      title: `Smoke offsite ${RUN_ID}`,
      startsOn: "2026-12-01",
      endsOn: "2026-12-05",
      budget: "1000.00",
      perMember: "250.00",
    }),
  });
  const event = (await readJson(eventResponse)) as {
    id?: unknown;
    kittyId?: unknown;
  };

  if (eventResponse.status !== 201 || typeof event.id !== "string") {
    fail(`POST /api/events returned ${eventResponse.status}`);
  }

  if (typeof event.kittyId !== "string") {
    fail("the event was created without a gateway kitty id");
  }

  const eventId = event.id;
  const kittyId = event.kittyId;
  pass(`created event ${eventId} with kitty ${kittyId}`);

  // 3. Add a member.
  const memberResponse = await apiFetch(`/api/events/${eventId}/members`, {
    method: "POST",
    body: JSON.stringify({ name: "Smoke Member", email: `member-${RUN_ID}@kitty.test` }),
  });

  if (memberResponse.status !== 201) {
    fail(`POST members returned ${memberResponse.status}`);
  }

  pass("added a member");

  // 4. Add a vendor (starts unverified).
  const vendorEmail = `vendor-${RUN_ID}@kitty.test`;
  const vendorResponse = await apiFetch(`/api/events/${eventId}/vendors`, {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke Homestay",
      paypalEmail: vendorEmail,
      category: "lodging",
      quote: "800.00",
    }),
  });
  const vendor = (await readJson(vendorResponse)) as { id?: unknown; verified?: unknown };

  if (vendorResponse.status !== 201 || typeof vendor.id !== "string") {
    fail(`POST vendors returned ${vendorResponse.status}`);
  }

  if (vendor.verified !== false) {
    fail("a new vendor must start unverified (AGENTS.md invariant #12)");
  }

  pass("added an unverified vendor");

  // 5. Verify the vendor (organizer-only) — this registers the gateway payee.
  const verifyResponse = await apiFetch(`/api/events/${eventId}/vendors/${vendor.id}/verify`, {
    method: "POST",
  });
  const verified = (await readJson(verifyResponse)) as { verified?: unknown };

  if (verifyResponse.status !== 200 || verified.verified !== true) {
    fail(`verify returned ${verifyResponse.status}`);
  }

  pass("verified the vendor");

  // 6. Read the gateway back: the payee must be listed.
  const payees = await gatewayAdminClient.listPayees({ userId, kittyId });
  const found = payees.some((payee) => payee.email === vendorEmail.toLowerCase());

  if (!found) {
    fail(`gateway payees did not include ${vendorEmail}`);
  }

  pass(`gateway lists ${payees.length} verified payee(s), including ${vendorEmail}`);
  console.log("SMOKE OK");
}

await main();
