import { afterAll, describe, expect, test } from "bun:test";
import {
  type Db,
  createDb,
  agentKeys,
  kitties,
  leashes,
  ledgerEntries,
  verifiedPayees,
} from "@kitty/db";
import { accountKey, balanceOf, contribution, kittyAvailable, leashAvailable } from "@kitty/ledger";
import { generateAgentKeyPair } from "@kitty/signing";
import { idPrefixes } from "@kitty/shared";
import {
  kittyDetailSchema,
  leashDetailSchema,
  leashListItemSchema,
  verifiedPayeeSchema,
} from "@kitty/shared/leash-admin";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createAdminAuth, signAdminRequest } from "../../../src/admin/auth";
import { handleError } from "../../../src/app";
import { newId } from "../../../src/lib/ids";
import { postLedgerTxn } from "../../../src/lib/ledger";
import { createV1Routes } from "../../../src/modules/v1";

/**
 * Gateway Admin API integration suite (docs/10-api-spec.md §1).
 *
 * Runs against the Neon dev branch using `DATABASE_URL` from `apps/gateway/.env`
 * (`bun run test:integration`) and is intentionally **excluded** from
 * `bun run test` / `bun run ci`.
 *
 * Cleanup: every run uses a fresh throwaway kitty id and deletes its mutable
 * rows (leashes, agent keys, verified payees, the kitty) in `afterAll`.
 * `leash.ledger_entries` and `leash.audit_events` are append-only, so their rows
 * are left behind on purpose — they are scoped to the throwaway kitty id.
 */

const databaseUrl = process.env.DATABASE_URL;
const TOKEN = "integration-admin-token";
const OWNER = "user_integration_owner";

const trackedKittyIds: string[] = [];
let db: Db | undefined;
let app: Hono | undefined;

function requireDb(): Db {
  if (db === undefined) {
    throw new Error("DATABASE_URL is not set; integration suite should have been skipped");
  }

  return db;
}

function requireApp(): Hono {
  if (app === undefined) {
    throw new Error("integration app was not built");
  }

  return app;
}

if (databaseUrl !== undefined) {
  db = createDb(databaseUrl);
  app = new Hono().onError(handleError).route("/v1", createV1Routes(createAdminAuth(() => TOKEN)));
}

interface SignedInit {
  readonly method?: string;
  readonly body?: unknown;
  readonly userId?: string;
}

async function call(path: string, init: SignedInit = {}): Promise<Response> {
  const rawBody = init.body === undefined ? "" : JSON.stringify(init.body);
  const headers = await signAdminRequest({
    token: TOKEN,
    userId: init.userId ?? OWNER,
    body: rawBody,
  });

  return requireApp().request(path, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? headers : { ...headers, "content-type": "application/json" },
    body: init.body === undefined ? undefined : rawBody,
  });
}

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

/** Creates a kitty through the API and tracks it for cleanup. */
async function createKitty(): Promise<ReturnType<typeof kittyDetailSchema.parse>> {
  const response = await call("/v1/kitties", {
    method: "POST",
    body: { eventId: newId(idPrefixes.event), currency: "USD" },
  });

  expect(response.status).toBe(201);

  const kitty = kittyDetailSchema.parse(await readJson(response));
  trackedKittyIds.push(kitty.id);

  return kitty;
}

/** Seeds a contribution ledger transaction directly (no admin endpoint yet). */
async function seedContribution(kittyId: string, amountCents: bigint): Promise<void> {
  await postLedgerTxn(
    requireDb(),
    contribution({
      txnId: `txn_seed_${newId(idPrefixes.contribution)}`,
      kittyId,
      memberId: newId(idPrefixes.member),
      amountCents,
    }),
    kittyId,
  );
}

async function registerAgent(kittyId: string): Promise<string> {
  const keyPair = await generateAgentKeyPair();
  const agentId = newId(idPrefixes.agent);

  const response = await call("/v1/agents", {
    method: "POST",
    body: { agentId, kittyId, role: "treasurer", publicKey: keyPair.publicKey },
  });

  expect(response.status).toBe(201);

  return agentId;
}

async function verifyPayee(kittyId: string, email: string): Promise<string> {
  const response = await call(`/v1/kitties/${kittyId}/payees`, {
    method: "POST",
    body: { email },
  });

  expect(response.status).toBe(201);

  const payee = verifiedPayeeSchema.parse(await readJson(response));

  return payee.email;
}

function leashBody(
  kittyId: string,
  agentId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kittyId,
    agentId,
    allocation: "60.00",
    limits: { perTxMax: "30.00", dailyMax: "50.00", maxTxPerHour: 6 },
    allowedActions: ["payout", "refund"],
    allowedPayees: [],
    allowedCategories: ["lodging"],
    stepUpAbove: "20.00",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/** All ledger lines of a kitty, for cross-checking against `@kitty/ledger`. */
async function ledgerLinesFor(kittyId: string) {
  return requireDb().select().from(ledgerEntries).where(eq(ledgerEntries.kittyId, kittyId));
}

describe.skipIf(databaseUrl === undefined)("Gateway Admin API integration", () => {
  test("create kitty -> contribute -> verify payee -> create leash -> topup -> revoke", async () => {
    const kitty = await createKitty();

    expect(kitty.balances).toEqual({
      available: "0.00",
      allocated: "0.00",
      held: "0.00",
      spent: "0.00",
      contributed: "0.00",
      refunded: "0.00",
    });

    await seedContribution(kitty.id, 10_000n);

    const agentId = await registerAgent(kitty.id);
    const email = await verifyPayee(kitty.id, "Homestay@Vendor.Example");
    expect(email).toBe("homestay@vendor.example");

    const createResponse = await call("/v1/leashes", {
      method: "POST",
      body: leashBody(kitty.id, agentId, { allowedPayees: ["homestay@vendor.example"] }),
    });

    expect(createResponse.status).toBe(201);

    const leash = leashListItemSchema.parse(await readJson(createResponse));
    expect(leash.allocation).toBe("60.00");
    expect(leash.usage.available).toBe("60.00");
    expect(leash.usage.held).toBe("0.00");

    const afterCreate = kittyDetailSchema.parse(
      await readJson(await call(`/v1/kitties/${kitty.id}`)),
    );
    expect(afterCreate.balances.contributed).toBe("100.00");
    expect(afterCreate.balances.allocated).toBe("60.00");
    expect(afterCreate.balances.available).toBe("40.00");

    const topupResponse = await call(`/v1/leashes/${leash.id}/topup`, {
      method: "POST",
      body: { amount: "10.00" },
    });

    expect(topupResponse.status).toBe(200);

    const toppedUp = leashListItemSchema.parse(await readJson(topupResponse));
    expect(toppedUp.allocation).toBe("70.00");
    expect(toppedUp.usage.available).toBe("70.00");

    const revokeResponse = await call(`/v1/leashes/${leash.id}/revoke`, {
      method: "POST",
      body: { reason: "demo finished" },
    });

    expect(revokeResponse.status).toBe(200);

    const revoked = leashDetailSchema.parse(await readJson(revokeResponse));
    expect(revoked.status).toBe("revoked");
    expect(revoked.available).toBe("0.00");
    expect(revoked.spent24h).toBe("0.00");

    const finalKitty = kittyDetailSchema.parse(
      await readJson(await call(`/v1/kitties/${kitty.id}`)),
    );
    expect(finalKitty.balances.available).toBe("100.00");
    expect(finalKitty.balances.allocated).toBe("0.00");

    // Cross-check against `@kitty/ledger`: (re)compute balances from the raw
    // ledger lines the API produced.
    const lines = (await ledgerLinesFor(kitty.id)).map((row) => ({
      account: row.account,
      amountCents: row.amountCents,
    }));
    expect(balanceOf(lines, accountKey(kittyAvailable(kitty.id)))).toBe(10_000n);
    expect(balanceOf(lines, accountKey(leashAvailable(leash.id)))).toBe(0n);
  });

  test("concurrent leash creation over the same kitty available never over-allocates", async () => {
    const kitty = await createKitty();
    await seedContribution(kitty.id, 10_000n);

    const [agentA, agentB] = await Promise.all([registerAgent(kitty.id), registerAgent(kitty.id)]);

    const [responseA, responseB] = await Promise.all([
      call("/v1/leashes", {
        method: "POST",
        body: leashBody(kitty.id, agentA, {
          allocation: "100.00",
          limits: { perTxMax: "100.00", dailyMax: "100.00", maxTxPerHour: 6 },
        }),
      }),
      call("/v1/leashes", {
        method: "POST",
        body: leashBody(kitty.id, agentB, {
          allocation: "100.00",
          limits: { perTxMax: "100.00", dailyMax: "100.00", maxTxPerHour: 6 },
        }),
      }),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const finalKitty = kittyDetailSchema.parse(
      await readJson(await call(`/v1/kitties/${kitty.id}`)),
    );

    // Exactly one allocation of 100.00 landed; the kitty never went negative.
    expect(finalKitty.balances.allocated).toBe("100.00");
    expect(finalKitty.balances.available).toBe("0.00");
  });

  test("rejects an unverified payee until the organizer verifies it", async () => {
    const kitty = await createKitty();
    await seedContribution(kitty.id, 10_000n);
    const agentId = await registerAgent(kitty.id);

    const rejected = await call("/v1/leashes", {
      method: "POST",
      body: leashBody(kitty.id, agentId, { allowedPayees: ["unknown@vendor.example"] }),
    });

    expect(rejected.status).toBe(400);
    const rejectedBody = (await readJson(rejected)) as { error: { code: string } };
    expect(rejectedBody.error.code).toBe("PAYEE_NOT_VERIFIED");

    await verifyPayee(kitty.id, "unknown@vendor.example");

    const accepted = await call("/v1/leashes", {
      method: "POST",
      body: leashBody(kitty.id, agentId, { allowedPayees: ["unknown@vendor.example"] }),
    });

    expect(accepted.status).toBe(201);
  });

  test("enforces ownership (403) and unknown ids (404)", async () => {
    const kitty = await createKitty();

    const otherUser = await call(`/v1/kitties/${kitty.id}`, { userId: "user_intruder" });
    expect(otherUser.status).toBe(403);

    const missing = await call(`/v1/kitties/${newId(idPrefixes.kitty)}`);
    expect(missing.status).toBe(404);
    const missingBody = (await readJson(missing)) as { error: { code: string } };
    expect(missingBody.error.code).toBe("KITTY_NOT_FOUND");
  });

  test("pause / resume enforce the leash lifecycle", async () => {
    const kitty = await createKitty();
    await seedContribution(kitty.id, 10_000n);
    const agentId = await registerAgent(kitty.id);

    const created = leashListItemSchema.parse(
      await readJson(
        await call("/v1/leashes", { method: "POST", body: leashBody(kitty.id, agentId) }),
      ),
    );

    const paused = leashDetailSchema.parse(
      await readJson(await call(`/v1/leashes/${created.id}/pause`, { method: "POST", body: {} })),
    );
    expect(paused.status).toBe("paused");

    const pausedAgain = await call(`/v1/leashes/${created.id}/pause`, { method: "POST", body: {} });
    expect(pausedAgain.status).toBe(409);
    const pausedAgainBody = (await readJson(pausedAgain)) as { error: { code: string } };
    expect(pausedAgainBody.error.code).toBe("INVALID_STATE_TRANSITION");

    const resumed = leashDetailSchema.parse(
      await readJson(await call(`/v1/leashes/${created.id}/resume`, { method: "POST", body: {} })),
    );
    expect(resumed.status).toBe("active");
  });

  test("lists leashes, ledger, payees and audit feed", async () => {
    const kitty = await createKitty();
    await seedContribution(kitty.id, 10_000n);
    const agentId = await registerAgent(kitty.id);
    await verifyPayee(kitty.id, "bus@vendor.example");

    const created = leashListItemSchema.parse(
      await readJson(
        await call("/v1/leashes", {
          method: "POST",
          body: leashBody(kitty.id, agentId, { allowedPayees: ["bus@vendor.example"] }),
        }),
      ),
    );

    const leashes = (await readJson(await call(`/v1/kitties/${kitty.id}/leashes`))) as {
      items: unknown[];
    };
    expect(leashes.items).toHaveLength(1);

    const ledger = (await readJson(await call(`/v1/kitties/${kitty.id}/ledger`))) as {
      items: unknown[];
      nextCursor: string | null;
    };
    // contribution (2 lines) + allocate (2 lines) = 4 entries.
    expect(ledger.items).toHaveLength(4);

    const payees = (await readJson(await call(`/v1/kitties/${kitty.id}/payees`))) as {
      items: unknown[];
    };
    expect(payees.items).toHaveLength(1);

    const audit = (await readJson(await call(`/v1/kitties/${kitty.id}/audit`))) as {
      items: unknown[];
      nextCursor: string | null;
    };
    expect(audit.items.length).toBeGreaterThanOrEqual(2);

    const intents = (await readJson(await call(`/v1/kitties/${kitty.id}/intents`))) as {
      items: unknown[];
    };
    expect(intents.items).toHaveLength(0);

    expect(created.status).toBe("active");
  });

  test("rejects a second active leash for the same agent", async () => {
    const kitty = await createKitty();
    await seedContribution(kitty.id, 10_000n);
    const agentId = await registerAgent(kitty.id);

    const first = await call("/v1/leashes", { method: "POST", body: leashBody(kitty.id, agentId) });
    expect(first.status).toBe(201);

    const second = await call("/v1/leashes", {
      method: "POST",
      body: leashBody(kitty.id, agentId),
    });
    expect(second.status).toBe(409);
    const body = (await readJson(second)) as { error: { code: string } };
    expect(body.error.code).toBe("AGENT_ALREADY_LEASHED");
  });
});

afterAll(async () => {
  if (db === undefined) {
    return;
  }

  for (const kittyId of trackedKittyIds) {
    await db.delete(leashes).where(eq(leashes.kittyId, kittyId));
    await db.delete(agentKeys).where(eq(agentKeys.kittyId, kittyId));
    await db.delete(verifiedPayees).where(eq(verifiedPayees.kittyId, kittyId));
    await db.delete(kitties).where(eq(kitties.id, kittyId));
  }

  // Ledger and audit rows are append-only; leave them scoped to the throwaway
  // kitty ids.
  await db.$client.end();
});
