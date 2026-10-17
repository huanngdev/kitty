import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { type MiddlewareHandler, Hono } from "hono";
import { getDb } from "../../lib/db";
import { getPayoutExecutor } from "../../lib/paypal";
import {
  createAgentAuth,
  createPostgresNonceStore,
  createResolvePublicKey,
  type AgentAuthEnv,
} from "../agent-auth";
import { createDrizzleIntentsStore, createIntentsService, type IntentsService } from "../intents";
import { createAgentLeashService, type AgentLeashService } from "./agent-leash.service";
import { createLeashMcpServer } from "./server";

/**
 * `POST /mcp` — the Gateway Agent API (docs/10 §2).
 *
 * Stateless Streamable HTTP: a new `McpServer` + `WebStandardStreamableHTTPServerTransport`
 * (`sessionIdGenerator: undefined`) is created for every request, authenticated
 * first by {@link agentAuth} over the exact raw body bytes, then handed those
 * same bytes through a rebuilt `Request`. Responses are JSON
 * (`enableJsonResponse`), which keeps the stateless path simple and testable.
 */

export const MCP_PATH = "/mcp";

let intentsService: IntentsService | undefined;
let agentLeashService: AgentLeashService | undefined;

/** The gateway's intents service (same code the internal API uses). */
function getIntentsService(): IntentsService {
  intentsService ??= createIntentsService({
    store: createDrizzleIntentsStore(getDb()),
    payouts: { createPayout: (input) => getPayoutExecutor().createPayout(input) },
    now: () => new Date(),
  });

  return intentsService;
}

function getAgentLeashService(): AgentLeashService {
  agentLeashService ??= createAgentLeashService({
    db: getDb(),
    intents: getIntentsService(),
    now: () => new Date(),
  });

  return agentLeashService;
}

/**
 * The agent auth middleware wired to Postgres: the public key comes from
 * `leash.agent_keys` and the nonce claim from `leash.nonces`. Both clients are
 * resolved lazily so the service still boots without a database.
 */
const agentAuth: MiddlewareHandler<AgentAuthEnv> = createAgentAuth({
  resolvePublicKey: (agentId) => createResolvePublicKey(getDb())(agentId),
  nonceStore: {
    async claim(agentId, nonce, expiresAt) {
      return createPostgresNonceStore(getDb()).claim(agentId, nonce, expiresAt);
    },
  },
  now: () => new Date(),
});

/**
 * Rebuilds the request so the MCP transport re-reads the **same bytes** that
 * were verified. `c.req.raw`'s body stream is already consumed by the auth
 * middleware, so the transport must be handed a fresh, equivalent request.
 */
function toTransportRequest(original: Request, rawBody: Uint8Array): Request {
  const init: RequestInit = { method: original.method, headers: original.headers };

  if (original.method === "POST" || original.method === "PUT" || original.method === "PATCH") {
    return new Request(original.url, { ...init, body: rawBody });
  }

  return new Request(original.url, init);
}

export function createMcpRoutes(auth: MiddlewareHandler<AgentAuthEnv>): Hono<AgentAuthEnv> {
  return new Hono<AgentAuthEnv>().use("*", auth).post("/", async (c) => {
    const server = createLeashMcpServer({
      agentId: c.get("agentId"),
      service: getAgentLeashService(),
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);

    try {
      return await transport.handleRequest(toTransportRequest(c.req.raw, c.get("rawBody")));
    } finally {
      await transport.close();
      await server.close();
    }
  });
}

/** The `/mcp` routes mounted by the gateway app (one line in `app.ts`). */
export const mcpRoutes = createMcpRoutes(agentAuth);
