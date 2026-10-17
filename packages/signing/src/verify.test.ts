import { describe, expect, test } from "bun:test";
import type { HeaderGetter, HeaderSource, LeashHeaders } from "./headers";
import { generateAgentKeyPair } from "./keys";
import { createMemoryNonceStore, type NonceStore } from "./nonce-store";
import { randomNonce, signRequest, type SignRequestInput } from "./sign";
import {
  verifyRequest,
  type ResolvePublicKey,
  type VerifyRequestInput,
  type VerifyResult,
} from "./verify";

const agentId = "agt_01JBXR7Q0J0Q4QTP8W3G8V0S3K";
const method = "POST";
const path = "/mcp?kitty=kty_01JBXR7Q0J0Q4QTP8W3G8V0S3K";
const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" });
const now = new Date("2026-11-02T08:15:30.000Z");

const keyPair = await generateAgentKeyPair();
const otherKeyPair = await generateAgentKeyPair();

const knownAgent: ResolvePublicKey = async (id) => (id === agentId ? keyPair.publicKey : null);

async function signedHeaders(overrides: Partial<SignRequestInput> = {}): Promise<LeashHeaders> {
  return signRequest({
    agentId,
    privateKey: keyPair.privateKey,
    method,
    path,
    body,
    now,
    nonce: randomNonce(),
    ...overrides,
  });
}

function verifyInput(headers: HeaderSource): VerifyRequestInput {
  return {
    headers,
    method,
    path,
    body,
    now,
    resolvePublicKey: knownAgent,
    nonceStore: createMemoryNonceStore(),
  };
}

/** Verifies the request as sent, with a single component replaced. */
async function tamper(
  component: Partial<Pick<VerifyRequestInput, "method" | "path" | "body">> | "timestamp" | "nonce",
  headers: LeashHeaders,
): Promise<VerifyResult> {
  const input = verifyInput(headers);

  if (component === "timestamp") {
    return verifyRequest({
      ...input,
      headers: { ...headers, "Leash-Timestamp": "2026-11-02T08:15:31Z" },
    });
  }
  if (component === "nonce") {
    return verifyRequest({
      ...input,
      headers: { ...headers, "Leash-Nonce": `${headers["Leash-Nonce"]}A` },
    });
  }

  return verifyRequest({ ...input, ...component });
}

describe("verifyRequest — happy path", () => {
  test("accepts a fresh, correctly signed request", async () => {
    expect(await verifyRequest(verifyInput(await signedHeaders()))).toEqual({ ok: true, agentId });
  });

  test("accepts a Headers instance", async () => {
    const headers = new Headers(Object.entries(await signedHeaders()));

    expect(await verifyRequest(verifyInput(headers))).toEqual({ ok: true, agentId });
  });

  test("accepts a plain record with lowercased keys", async () => {
    const lowercased: Record<string, string> = {};
    for (const [key, value] of Object.entries(await signedHeaders())) {
      lowercased[key.toLowerCase()] = value;
    }

    expect(await verifyRequest(verifyInput(lowercased))).toEqual({ ok: true, agentId });
  });

  test("accepts any object exposing a Headers-style get()", async () => {
    const headers = await signedHeaders();
    const stored = new Map(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    );
    const getter: HeaderGetter = { get: (name) => stored.get(name.toLowerCase()) };

    expect(await verifyRequest(verifyInput(getter))).toEqual({ ok: true, agentId });
  });

  test("treats a get() that returns undefined as a missing header", async () => {
    const getter: HeaderGetter = { get: (name) => (name === "Leash-Agent" ? agentId : undefined) };

    expect(await verifyRequest(verifyInput(getter))).toEqual({
      ok: false,
      code: "MALFORMED_HEADERS",
    });
  });

  test("treats string and byte bodies as the same message", async () => {
    const headers = await signedHeaders({ body: new TextEncoder().encode(body) });

    expect(await verifyRequest(verifyInput(headers))).toEqual({ ok: true, agentId });
  });
});

describe("verifyRequest — malformed headers", () => {
  test("rejects a request without Leash headers", async () => {
    expect(await verifyRequest(verifyInput({}))).toEqual({ ok: false, code: "MALFORMED_HEADERS" });
  });

  test("rejects a missing or empty agent id", async () => {
    const headers = await signedHeaders();

    expect(await verifyRequest(verifyInput({ ...headers, "Leash-Agent": undefined }))).toEqual({
      ok: false,
      code: "MALFORMED_HEADERS",
    });
    expect(await verifyRequest(verifyInput({ ...headers, "Leash-Agent": "" }))).toEqual({
      ok: false,
      code: "MALFORMED_HEADERS",
    });
  });

  test("rejects a timestamp that is not the wire format", async () => {
    const headers = await signedHeaders();

    expect(
      await verifyRequest(
        verifyInput({ ...headers, "Leash-Timestamp": "2026-11-02T08:15:30.000Z" }),
      ),
    ).toEqual({ ok: false, code: "MALFORMED_HEADERS" });
    expect(
      await verifyRequest(verifyInput({ ...headers, "Leash-Timestamp": "2026-13-01T00:00:00Z" })),
    ).toEqual({ ok: false, code: "MALFORMED_HEADERS" });
  });

  test("rejects a nonce that is not base64url", async () => {
    const headers = await signedHeaders();

    expect(await verifyRequest(verifyInput({ ...headers, "Leash-Nonce": "!!!" }))).toEqual({
      ok: false,
      code: "MALFORMED_HEADERS",
    });
  });

  test("rejects a signature with an unknown scheme prefix or bad base64url", async () => {
    const headers = await signedHeaders();

    expect(await verifyRequest(verifyInput({ ...headers, "Leash-Signature": "rsa=AAAA" }))).toEqual(
      { ok: false, code: "MALFORMED_HEADERS" },
    );
    expect(
      await verifyRequest(verifyInput({ ...headers, "Leash-Signature": "ed25519=***" })),
    ).toEqual({ ok: false, code: "MALFORMED_HEADERS" });
    expect(await verifyRequest(verifyInput({ ...headers, "Leash-Signature": "" }))).toEqual({
      ok: false,
      code: "MALFORMED_HEADERS",
    });
  });
});

describe("verifyRequest — signature", () => {
  test("rejects tampering with the method, path, body, timestamp or nonce", async () => {
    const headers = await signedHeaders();

    expect(await tamper({ method: "DELETE" }, headers)).toEqual({
      ok: false,
      code: "BAD_SIGNATURE",
    });
    expect(await tamper({ path: `${path}&extra=1` }, headers)).toEqual({
      ok: false,
      code: "BAD_SIGNATURE",
    });
    expect(await tamper({ body: `${body} ` }, headers)).toEqual({
      ok: false,
      code: "BAD_SIGNATURE",
    });
    expect(await tamper("timestamp", headers)).toEqual({ ok: false, code: "BAD_SIGNATURE" });
    expect(await tamper("nonce", headers)).toEqual({ ok: false, code: "BAD_SIGNATURE" });
  });

  test("rejects a signature made by another agent's key", async () => {
    const headers = await signedHeaders({ privateKey: otherKeyPair.privateKey });

    expect(await verifyRequest(verifyInput(headers))).toEqual({ ok: false, code: "BAD_SIGNATURE" });
  });

  test("rejects a stored public key that is not importable", async () => {
    const headers = await signedHeaders();

    expect(
      await verifyRequest({
        ...verifyInput(headers),
        resolvePublicKey: async () => "not base64url!",
      }),
    ).toEqual({ ok: false, code: "BAD_SIGNATURE" });
    expect(
      await verifyRequest({
        ...verifyInput(headers),
        resolvePublicKey: async () => "AA",
      }),
    ).toEqual({ ok: false, code: "BAD_SIGNATURE" });
  });

  test("returns UNKNOWN_AGENT for an agent id the resolver does not know", async () => {
    const headers = await signedHeaders();

    expect(
      await verifyRequest({
        ...verifyInput(headers),
        headers: { ...headers, "Leash-Agent": "agt_01JBXR7Q0J0Q4QTP8W3G8V0S3Z" },
      }),
    ).toEqual({ ok: false, code: "UNKNOWN_AGENT" });
  });
});

describe("verifyRequest — timestamp window", () => {
  const at = (offsetMs: number): Date => new Date(now.getTime() + offsetMs);

  test("accepts requests inside ±60s", async () => {
    for (const offset of [0, 60_000, -60_000]) {
      const headers = await signedHeaders();

      expect(await verifyRequest({ ...verifyInput(headers), now: at(offset) })).toEqual({
        ok: true,
        agentId,
      });
    }
  });

  test("rejects requests outside ±60s", async () => {
    for (const offset of [60_001, -60_001, 3_600_000]) {
      const headers = await signedHeaders();

      expect(await verifyRequest({ ...verifyInput(headers), now: at(offset) })).toEqual({
        ok: false,
        code: "STALE_TIMESTAMP",
      });
    }
  });
});

describe("verifyRequest — replay protection", () => {
  test("rejects a replayed nonce", async () => {
    const headers = await signedHeaders();
    const nonceStore = createMemoryNonceStore();

    expect(await verifyRequest({ ...verifyInput(headers), nonceStore })).toEqual({
      ok: true,
      agentId,
    });
    expect(await verifyRequest({ ...verifyInput(headers), nonceStore })).toEqual({
      ok: false,
      code: "NONCE_REPLAY",
    });
  });

  test("rejects the same nonce with a fresh timestamp inside the 10 minute window", async () => {
    const nonce = randomNonce();
    const nonceStore = createMemoryNonceStore();
    const first = await signedHeaders({ nonce });
    const replay = await signedHeaders({ nonce, now: new Date(now.getTime() + 5_000) });

    expect(await verifyRequest({ ...verifyInput(first), nonceStore })).toEqual({
      ok: true,
      agentId,
    });
    expect(
      await verifyRequest({
        ...verifyInput(replay),
        now: new Date(now.getTime() + 5_000),
        nonceStore,
      }),
    ).toEqual({ ok: false, code: "NONCE_REPLAY" });
  });

  test("rejects a nonce the store has already claimed", async () => {
    const headers = await signedHeaders();
    const nonceStore: NonceStore = {
      claim: async () => false,
    };

    expect(await verifyRequest({ ...verifyInput(headers), nonceStore })).toEqual({
      ok: false,
      code: "NONCE_REPLAY",
    });
  });

  test("only a valid signature may consume a nonce", async () => {
    const headers = await signedHeaders();
    const nonceStore = createMemoryNonceStore();

    expect(await tamper({ path: "/mcp" }, headers)).toEqual({ ok: false, code: "BAD_SIGNATURE" });
    expect(await verifyRequest({ ...verifyInput(headers), nonceStore })).toEqual({
      ok: true,
      agentId,
    });
    expect(nonceStore.size()).toBe(1);
  });
});
