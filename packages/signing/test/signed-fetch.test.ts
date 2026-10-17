import { describe, expect, test } from "bun:test";
import { generateAgentKeyPair } from "../src/keys";
import { createMemoryNonceStore } from "../src/nonce-store";
import { createSignedFetch, type SignedFetch } from "../src/signed-fetch";
import { verifyRequest } from "../src/verify";

/**
 * `createSignedFetch` is the agent-side helper (docs/05 §5): it signs the exact
 * bytes it sends and then delegates to the transport. These tests prove the
 * round trip by verifying the captured request with `verifyRequest`.
 */

const NOW = new Date("2026-11-02T08:15:30Z");
const PATH = "/mcp?kitty=kty_01JX";

interface Captured {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function capturingFetch(into: Captured[]): SignedFetch {
  return async (url, init): Promise<Response> => {
    into.push({ url: String(url), init });

    return new Response("ok", { status: 200 });
  };
}

describe("createSignedFetch", () => {
  test("signs the request so the gateway verifies it over the same bytes", async () => {
    const keys = await generateAgentKeyPair();
    const nonceStore = createMemoryNonceStore();
    const captured: Captured[] = [];
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

    const signedFetch = createSignedFetch({
      agentId: "agt_01JSIGNEDFETCHTESTAGENT001",
      privateKey: keys.privateKey,
      now: () => NOW,
      nonce: () => "MDEyMzQ1Njc4OWFiY2RlZg",
      baseFetch: capturingFetch(captured),
    });

    await signedFetch(`https://gateway.test${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
    });

    const request = captured[0];
    expect(request).toBeDefined();
    if (request === undefined) {
      return;
    }

    const result = await verifyRequest({
      headers: new Headers(request.init?.headers),
      method: "POST",
      path: PATH,
      body,
      now: NOW,
      resolvePublicKey: async () => keys.publicKey,
      nonceStore,
    });

    expect(result).toEqual({ ok: true, agentId: "agt_01JSIGNEDFETCHTESTAGENT001" });
    expect(request.init?.headers).toBeInstanceOf(Headers);
  });

  test("generates a fresh nonce per request", async () => {
    const keys = await generateAgentKeyPair();
    const captured: Captured[] = [];
    const signedFetch = createSignedFetch({
      agentId: "agt_01JSIGNEDFETCHTESTAGENT002",
      privateKey: keys.privateKey,
      now: () => NOW,
      baseFetch: capturingFetch(captured),
    });

    await signedFetch(`https://gateway.test${PATH}`, { method: "POST", body: "{}" });
    await signedFetch(`https://gateway.test${PATH}`, { method: "POST", body: "{}" });

    const nonces = captured.map((request) => new Headers(request.init?.headers).get("Leash-Nonce"));

    expect(nonces[0]).not.toBe(nonces[1]);
    expect(nonces[0]).not.toBeNull();
  });

  test("signs every supported body shape over its exact bytes", async () => {
    const keys = await generateAgentKeyPair();
    const encoder = new TextEncoder();
    const arrayBuffer = new ArrayBuffer(4);
    new Uint8Array(arrayBuffer).set([1, 2, 3, 4]);
    const bodies: ReadonlyArray<RequestInit["body"]> = [
      undefined,
      "",
      encoder.encode("bytes"),
      arrayBuffer,
      new URLSearchParams({ a: "1" }),
      new DataView(arrayBuffer),
    ];

    for (const body of bodies) {
      const captured: Captured[] = [];
      const signedFetch = createSignedFetch({
        agentId: "agt_01JSIGNEDFETCHTESTAGENT002",
        privateKey: keys.privateKey,
        now: () => NOW,
        baseFetch: capturingFetch(captured),
      });

      await signedFetch(`https://gateway.test${PATH}`, { method: "POST", body });

      const signature = new Headers(captured[0]?.init?.headers).get("Leash-Signature");
      expect(signature?.startsWith("ed25519=")).toBe(true);
    }
  });

  test("uses the system clock when none is injected", async () => {
    const keys = await generateAgentKeyPair();
    const captured: Captured[] = [];
    const signedFetch = createSignedFetch({
      agentId: "agt_01JSIGNEDFETCHTESTAGENT002",
      privateKey: keys.privateKey,
      baseFetch: capturingFetch(captured),
    });

    await signedFetch(`https://gateway.test${PATH}`, { method: "POST", body: "{}" });

    expect(new Headers(captured[0]?.init?.headers).get("Leash-Timestamp")).not.toBeNull();
  });

  test("rejects a body whose bytes cannot be reproduced", async () => {
    const keys = await generateAgentKeyPair();
    const signedFetch = createSignedFetch({
      agentId: "agt_01JSIGNEDFETCHTESTAGENT002",
      privateKey: keys.privateKey,
      now: () => NOW,
      baseFetch: capturingFetch([]),
    });

    await expect(
      signedFetch(`https://gateway.test${PATH}`, { method: "POST", body: new Blob() }),
    ).rejects.toThrow(TypeError);
  });
});
