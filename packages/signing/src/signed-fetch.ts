/**
 * A `fetch` wrapper that signs every request with an agent's Ed25519 key
 * (docs/05 §5).
 *
 * This is the one place `apps/agents` (and the integration tests) need to talk
 * to the gateway: hand it an agent id and its private key, and every request it
 * sends carries the four `Leash-*` headers over the exact bytes it sends. The
 * private key never leaves the caller and is never logged — this module contains
 * no logging at all (AGENTS.md §3 #11).
 */

import type { RequestBody } from "./canonical";
import { signRequest } from "./sign";

/** The subset of `fetch` this wrapper implements, matching the MCP SDK `FetchLike`. */
export type SignedFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface CreateSignedFetchInput {
  /** Agent id, for example `agt_01JB…`. */
  readonly agentId: string;
  /** base64url PKCS#8 private key; stays in the caller. */
  readonly privateKey: string;
  /** Clock used for the `Leash-Timestamp`; defaults to the system clock. */
  readonly now?: () => Date;
  /** Nonce source; defaults to a fresh 16-byte nonce per request. */
  readonly nonce?: () => string;
  /** Transport to delegate to; defaults to the global `fetch`. */
  readonly baseFetch?: SignedFetch;
}

/**
 * Normalises a `BodyInit` to the bytes that are signed.
 *
 * The MCP client always sends a JSON `string`; the other cases keep the helper
 * usable from a hand-written client. Streams and forms are rejected because
 * their bytes cannot be reproduced for the signature.
 */
async function bodyToSignedBody(body: RequestInit["body"]): Promise<RequestBody> {
  if (body === null || body === undefined) {
    return new Uint8Array();
  }

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  throw new TypeError(
    "createSignedFetch supports string, Uint8Array, ArrayBuffer or URLSearchParams request bodies",
  );
}

/**
 * Builds a signing `fetch`: it signs the request with the agent key and then
 * delegates to `baseFetch`.
 *
 * `url` must be absolute so the canonical `PATH` (pathname + query, docs/05 §5)
 * can be derived from it.
 */
export function createSignedFetch(input: CreateSignedFetchInput): SignedFetch {
  const now = input.now ?? ((): Date => new Date());
  const baseFetch = input.baseFetch ?? fetch;

  return async (url, init): Promise<Response> => {
    const target = typeof url === "string" ? new URL(url) : url;
    const method = init?.method ?? "GET";
    const body = await bodyToSignedBody(init?.body);
    const leashHeaders = await signRequest({
      agentId: input.agentId,
      privateKey: input.privateKey,
      method,
      path: `${target.pathname}${target.search}`,
      body,
      now: now(),
      nonce: input.nonce?.(),
    });

    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(leashHeaders)) {
      headers.set(name, value);
    }

    return baseFetch(url, { ...init, headers });
  };
}
