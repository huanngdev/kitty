/**
 * Agent-side request signing (docs/05 §5).
 *
 * `signRequest` is the only way an agent authenticates to the gateway: it signs
 * the canonical string with the agent's Ed25519 private key and returns the four
 * `Leash-*` headers to attach to the JSON-RPC POST. No secret is logged — this
 * package contains no logging at all (AGENTS.md §3 #11).
 *
 * Ed25519 is deterministic (RFC 8032), so the same key + canonical string always
 * produce the same signature; the nonce and timestamp are what make requests
 * unique.
 */

import { encodeBase64Url } from "./base64url";
import { canonicalRequest, type RequestBody } from "./canonical";
import { leashHeaderNames, type LeashHeaders } from "./headers";
import { importPrivateKey } from "./keys";
import { formatTimestamp } from "./timestamp";

/** Signature scheme prefix in `Leash-Signature`. */
export const SIGNATURE_ALGORITHM = "ed25519";

/** Number of random bytes in a `Leash-Nonce`. */
export const NONCE_BYTES = 16;

const encoder = new TextEncoder();

export interface SignRequestInput {
  /** Agent id, for example `agt_01JB…`. */
  agentId: string;
  /** base64url PKCS#8 private key; never leaves the agent runtime. */
  privateKey: string;
  /** HTTP method; uppercased before signing. */
  method: string;
  /** Request target as sent: pathname + query, no host. */
  path: string;
  /** Raw request body bytes (or the exact string body). */
  body: RequestBody;
  /** Clock to read the timestamp from; injectable for tests. */
  now: Date;
  /** Override the nonce (tests/vectors only); defaults to 16 random bytes. */
  nonce?: string;
}

/** Generates a fresh `Leash-Nonce`: 16 random bytes, base64url. */
export function randomNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);

  return encodeBase64Url(bytes);
}

/** Signs one request and returns the `Leash-*` headers to send with it. */
export async function signRequest(input: SignRequestInput): Promise<LeashHeaders> {
  const timestamp = formatTimestamp(input.now);
  const nonce = input.nonce ?? randomNonce();
  const privateKey = await importPrivateKey(input.privateKey);
  const canonical = await canonicalRequest({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    body: input.body,
  });

  const signature = await crypto.subtle.sign("Ed25519", privateKey, encoder.encode(canonical));

  return {
    [leashHeaderNames.agent]: input.agentId,
    [leashHeaderNames.timestamp]: timestamp,
    [leashHeaderNames.nonce]: nonce,
    [leashHeaderNames.signature]: `${SIGNATURE_ALGORITHM}=${encodeBase64Url(new Uint8Array(signature))}`,
  };
}
