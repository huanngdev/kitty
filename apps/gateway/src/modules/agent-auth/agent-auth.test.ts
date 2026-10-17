import { describe, expect, test } from "bun:test";
import {
  type LeashHeaders,
  createMemoryNonceStore,
  generateAgentKeyPair,
  signRequest,
} from "@kitty/signing";
import { Hono } from "hono";
import { AppError } from "../../lib/errors";
import { createAgentAuth, type AgentAuthEnv } from "./agent-auth";

/**
 * Unit tests for the agent auth middleware (docs/05 §5). They exercise every
 * failure code `verifyRequest` can return through the HTTP surface, plus the
 * success path that hands the agent id and raw bytes to the route.
 */

const NOW = new Date("2026-11-02T08:15:30Z");
const AGENT_ID = "agt_01JAUTHTESTAUTHTESTAUTHTE";

function buildApp(input: { publicKey: string | null; signedAt?: Date }): Hono<AgentAuthEnv> {
  const auth = createAgentAuth({
    resolvePublicKey: async () => input.publicKey,
    nonceStore: createMemoryNonceStore({ now: () => NOW }),
    now: () => NOW,
  });

  return new Hono<AgentAuthEnv>()
    .use("*", auth)
    .onError((error, c) => {
      if (error instanceof AppError) {
        return c.json(
          { error: { code: error.code, message: error.message, details: error.details } },
          error.httpStatus,
        );
      }

      return c.json({ error: { code: "INTERNAL" } }, 500);
    })
    .post("/mcp", (c) =>
      c.json({ agentId: c.get("agentId"), byteLength: c.get("rawBody").byteLength }),
    );
}

async function signedHeaders(
  privateKey: string,
  body: string,
  overrides: { signedAt?: Date; nonce?: string } = {},
): Promise<LeashHeaders> {
  return signRequest({
    agentId: AGENT_ID,
    privateKey,
    method: "POST",
    path: "/mcp",
    body,
    now: overrides.signedAt ?? NOW,
    nonce: overrides.nonce,
  });
}

describe("agent auth middleware", () => {
  test("accepts a correctly signed request and exposes the agent id and raw body", async () => {
    const keys = await generateAgentKeyPair();
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const app = buildApp({ publicKey: keys.publicKey });

    const response = await app.request("/mcp", {
      method: "POST",
      body,
      headers: await signedHeaders(keys.privateKey, body),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agentId: AGENT_ID, byteLength: body.length });
  });

  test("rejects a request with no signature headers", async () => {
    const app = buildApp({ publicKey: "unused" });
    const response = await app.request("/mcp", { method: "POST", body: "{}" });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "MALFORMED_HEADERS" } });
  });

  test("rejects an unknown agent", async () => {
    const keys = await generateAgentKeyPair();
    const body = "{}";
    const app = buildApp({ publicKey: null });

    const response = await app.request("/mcp", {
      method: "POST",
      body,
      headers: await signedHeaders(keys.privateKey, body),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNKNOWN_AGENT" } });
  });

  test("rejects a stale timestamp", async () => {
    const keys = await generateAgentKeyPair();
    const body = "{}";
    const app = buildApp({ publicKey: keys.publicKey });

    const response = await app.request("/mcp", {
      method: "POST",
      body,
      headers: await signedHeaders(keys.privateKey, body, {
        signedAt: new Date(NOW.getTime() - 5 * 60 * 1000),
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "STALE_TIMESTAMP" } });
  });

  test("rejects a tampered body", async () => {
    const keys = await generateAgentKeyPair();
    const signedBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const sentBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" });
    const app = buildApp({ publicKey: keys.publicKey });

    const response = await app.request("/mcp", {
      method: "POST",
      body: sentBody,
      headers: await signedHeaders(keys.privateKey, signedBody),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "BAD_SIGNATURE" } });
  });

  test("rejects a replayed request with a claimed nonce", async () => {
    const keys = await generateAgentKeyPair();
    const body = "{}";
    const app = buildApp({ publicKey: keys.publicKey });
    const headers = await signedHeaders(keys.privateKey, body, { nonce: "MDEyMzQ1Njc4OWFiY2RlZg" });

    const first = await app.request("/mcp", { method: "POST", body, headers });
    const second = await app.request("/mcp", { method: "POST", body, headers });

    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
    expect(await second.json()).toMatchObject({ error: { code: "NONCE_REPLAY" } });
  });
});
