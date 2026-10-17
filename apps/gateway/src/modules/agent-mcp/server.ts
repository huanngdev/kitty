import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentLeashService } from "./agent-leash.service";
import { registerLeashTools } from "./tools";

/**
 * The Kitty Leash Gateway MCP server (docs/06, docs/10 §2).
 *
 * Built **per request** for stateless Streamable HTTP: a fresh `McpServer`
 * closes over the authenticated agent so tool handlers never read an
 * `agentId`/`leashId` from their input (AGENTS.md invariant #3).
 */

/** `serverInfo` advertised to agents; version is the gateway MCP surface. */
export const MCP_SERVER_INFO = { name: "kitty-leash-gateway", version: "0.1.0" } as const;

export interface CreateLeashMcpServerInput {
  readonly agentId: string;
  readonly service: AgentLeashService;
}

/** Creates a server whose tools are bound to one authenticated agent. */
export function createLeashMcpServer(input: CreateLeashMcpServerInput): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_INFO.name,
    version: MCP_SERVER_INFO.version,
  });

  registerLeashTools(server, { agentId: input.agentId, service: input.service });

  return server;
}
