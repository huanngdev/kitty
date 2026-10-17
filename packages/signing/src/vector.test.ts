import { describe, expect, test } from "bun:test";
import { canonicalRequest } from "./canonical";
import { sha256Hex } from "./hash";
import { createMemoryNonceStore } from "./nonce-store";
import { signRequest } from "./sign";
import { verifyRequest, type VerifyRequestInput } from "./verify";

/**
 * Fixed test vector — generated once, then frozen.
 *
 * Ed25519 is deterministic (RFC 8032), so the signature below must stay
 * byte-identical for this keypair, timestamp, nonce and body. If a change makes
 * this test fail, the canonical string changed: that is a wire-format break for
 * every deployed agent.
 *
 * This keypair is test data, not a secret.
 */
const testVector = {
  agentId: "agt_01JBXR7Q0J0Q4QTP8W3G8V0S3K",
  publicKey: "p4lL6wQ78kE_YiEh69pbEbQOmzvPP1cDIXgc8VaeHrY",
  privateKey: "MC4CAQAwBQYDK2VwBCIEIGdwr9J1hlj3NpJNwItZBCbyf6Tixg52sFgl4ffnUL3T",
  method: "post",
  path: "/mcp?kitty=kty_01JBXR7Q0J0Q4QTP8W3G8V0S3K",
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" }),
  timestamp: "2026-11-02T08:15:30Z",
  now: new Date("2026-11-02T08:15:30.789Z"),
  nonce: "AAECAwQFBgcICQoLDA0ODw",
  bodyHash: "7423b5e8269f7d1be6b13214cb7ac414e4afa95ce9d4bf0590fa0e69f6978976",
  canonical:
    "leash-v1\nPOST\n/mcp?kitty=kty_01JBXR7Q0J0Q4QTP8W3G8V0S3K\n2026-11-02T08:15:30Z\nAAECAwQFBgcICQoLDA0ODw\n7423b5e8269f7d1be6b13214cb7ac414e4afa95ce9d4bf0590fa0e69f6978976",
  signature:
    "ed25519=bc_pKVMTkVY9glUQd97kAgMRqUTk-Dd4jA3OicWPZDSC0_rxyB4bGMzaSn8ca3LooUSCzWIcapoM10vuMiYvBg",
} as const;

describe("fixed signing test vector", () => {
  test("hashes the body to the frozen digest", async () => {
    expect(await sha256Hex(new TextEncoder().encode(testVector.body))).toBe(testVector.bodyHash);
  });

  test("builds the frozen canonical string", async () => {
    expect(
      await canonicalRequest({
        method: testVector.method,
        path: testVector.path,
        timestamp: testVector.timestamp,
        nonce: testVector.nonce,
        body: testVector.body,
      }),
    ).toBe(testVector.canonical);
  });

  test("produces the frozen headers", async () => {
    const headers = await signRequest({
      agentId: testVector.agentId,
      privateKey: testVector.privateKey,
      method: testVector.method,
      path: testVector.path,
      body: testVector.body,
      now: testVector.now,
      nonce: testVector.nonce,
    });

    expect(headers).toEqual({
      "Leash-Agent": testVector.agentId,
      "Leash-Timestamp": testVector.timestamp,
      "Leash-Nonce": testVector.nonce,
      "Leash-Signature": testVector.signature,
    });
  });

  test("verifies the frozen request and rejects a mutated one", async () => {
    const headers = await signRequest({
      agentId: testVector.agentId,
      privateKey: testVector.privateKey,
      method: testVector.method,
      path: testVector.path,
      body: testVector.body,
      now: testVector.now,
      nonce: testVector.nonce,
    });
    const input: VerifyRequestInput = {
      headers,
      method: testVector.method,
      path: testVector.path,
      body: testVector.body,
      now: testVector.now,
      resolvePublicKey: async (agentId) =>
        agentId === testVector.agentId ? testVector.publicKey : null,
      nonceStore: createMemoryNonceStore(),
    };

    expect(await verifyRequest(input)).toEqual({ ok: true, agentId: testVector.agentId });
    expect(await verifyRequest({ ...input, method: "GET" })).toEqual({
      ok: false,
      code: "BAD_SIGNATURE",
    });
  });
});
