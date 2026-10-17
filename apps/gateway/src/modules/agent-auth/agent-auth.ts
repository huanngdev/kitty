import {
  type NonceStore,
  type ResolvePublicKey,
  type VerifyFailureCode,
  verifyRequest,
} from "@kitty/signing";
import type { Context, MiddlewareHandler } from "hono";
import { AppError } from "../../lib/errors";

/**
 * Agent request authentication for the MCP endpoint (docs/05 §5, docs/10 §2).
 *
 * Every request to `POST /mcp` is authenticated **before** the MCP layer:
 * `@kitty/signing` `verifyRequest` runs over the exact raw body bytes and the
 * `Leash-*` headers, resolving the public key from `leash.agent_keys` and
 * claiming the nonce in `leash.nonces`. Failures become a `401` in the shared
 * error shape whose `code` is the verify code (`MALFORMED_HEADERS`,
 * `STALE_TIMESTAMP`, `UNKNOWN_AGENT`, `BAD_SIGNATURE`, `NONCE_REPLAY`).
 *
 * The raw body is read **once** here and handed to the MCP transport via the
 * context, so the bytes that were verified are the bytes that get parsed.
 * Signatures and keys are never logged (AGENTS.md invariant #11).
 */

export interface AgentAuthEnv {
  Variables: {
    /** The authenticated agent; tool handlers receive it by closure only. */
    agentId: string;
    /** Exact request bytes that were signed and verified. */
    rawBody: Uint8Array;
  };
}

export interface AgentAuthDeps {
  readonly resolvePublicKey: ResolvePublicKey;
  readonly nonceStore: NonceStore;
  /** Gateway clock; injectable for tests. */
  readonly now?: () => Date;
}

/** The `401` an agent gets when a request does not authenticate. */
export function agentAuthFailure(code: VerifyFailureCode): AppError {
  return new AppError(code, 401, { verifyCode: code });
}

/** The request target exactly as sent: pathname + query, never the host. */
function requestPath(c: Context): string {
  const url = new URL(c.req.url);

  return `${url.pathname}${url.search}`;
}

/**
 * Builds the auth middleware around injected key/nonce sources so tests can run
 * without a database (the app wires the Postgres implementations).
 */
export function createAgentAuth(deps: AgentAuthDeps): MiddlewareHandler<AgentAuthEnv> {
  const now = deps.now ?? ((): Date => new Date());

  return async (c, next) => {
    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    const result = await verifyRequest({
      headers: c.req.raw.headers,
      method: c.req.raw.method,
      path: requestPath(c),
      body: rawBody,
      now: now(),
      resolvePublicKey: deps.resolvePublicKey,
      nonceStore: deps.nonceStore,
    });

    if (!result.ok) {
      throw agentAuthFailure(result.code);
    }

    c.set("agentId", result.agentId);
    c.set("rawBody", rawBody);

    await next();
  };
}
