/**
 * Gateway-side request verification (docs/05 §5).
 *
 * Everything is injected — `resolvePublicKey` (DB lookup of the agent's public
 * key) and `nonceStore` (replay table). This package stays pure: no I/O, no
 * database, no network.
 *
 * Check order, and why it matters:
 * 1. parse headers → `MALFORMED_HEADERS`
 * 2. timestamp skew → `STALE_TIMESTAMP`
 * 3. resolve public key → `UNKNOWN_AGENT`
 * 4. verify Ed25519 signature → `BAD_SIGNATURE`
 * 5. **claim the nonce last** → `NONCE_REPLAY`
 *
 * Claiming last is deliberate: only a signature that actually verifies may burn
 * a nonce, otherwise anyone could replay-burn an agent's nonce and deny service.
 */

import { decodeBase64Url } from "./base64url";
import { canonicalRequest, type RequestBody } from "./canonical";
import { leashHeaderNames, readHeader, type HeaderSource } from "./headers";
import { importPublicKey } from "./keys";
import { NONCE_TTL_MS, type NonceStore } from "./nonce-store";
import { SIGNATURE_ALGORITHM } from "./sign";
import { parseTimestamp, TIMESTAMP_SKEW_MS } from "./timestamp";

export type VerifyFailureCode =
  "MALFORMED_HEADERS" | "UNKNOWN_AGENT" | "STALE_TIMESTAMP" | "BAD_SIGNATURE" | "NONCE_REPLAY";

export type VerifyResult = { ok: true; agentId: string } | { ok: false; code: VerifyFailureCode };

/** Looks up an agent's base64url raw public key; `null` when unknown. */
export type ResolvePublicKey = (agentId: string) => Promise<string | null>;

export interface VerifyRequestInput {
  /** `Headers` instance or plain record; lookup is case-insensitive. */
  headers: HeaderSource;
  /** Method as received; compared uppercased. */
  method: string;
  /** Request target as received: pathname + query, no host. */
  path: string;
  /** Raw request body bytes (or the exact string body). */
  body: RequestBody;
  /** Gateway clock; injectable for tests. */
  now: Date;
  resolvePublicKey: ResolvePublicKey;
  nonceStore: NonceStore;
}

interface ParsedLeashHeaders {
  agentId: string;
  /** Timestamp string exactly as received — it is part of the signed message. */
  timestamp: string;
  /** The same timestamp parsed to an instant. */
  signedAt: Date;
  nonce: string;
  signature: Uint8Array;
}

const encoder = new TextEncoder();

function parseLeashHeaders(
  headers: HeaderSource,
): { ok: true; value: ParsedLeashHeaders } | { ok: false } {
  const agentId = readHeader(headers, leashHeaderNames.agent);
  const timestamp = readHeader(headers, leashHeaderNames.timestamp);
  const nonce = readHeader(headers, leashHeaderNames.nonce);
  const signatureHeader = readHeader(headers, leashHeaderNames.signature);

  if (agentId === null || agentId.length === 0) {
    return { ok: false };
  }
  if (timestamp === null) {
    return { ok: false };
  }
  const signedAt = parseTimestamp(timestamp);
  if (signedAt === null) {
    return { ok: false };
  }
  if (nonce === null || decodeBase64Url(nonce) === null) {
    return { ok: false };
  }
  if (signatureHeader === null || !signatureHeader.startsWith(`${SIGNATURE_ALGORITHM}=`)) {
    return { ok: false };
  }

  const signature = decodeBase64Url(signatureHeader.slice(SIGNATURE_ALGORITHM.length + 1));
  if (signature === null) {
    return { ok: false };
  }

  return { ok: true, value: { agentId, timestamp, signedAt, nonce, signature } };
}

async function verifySignature(
  publicKey: string,
  signature: Uint8Array,
  canonical: string,
): Promise<boolean> {
  try {
    const key = await importPublicKey(publicKey);
    return await crypto.subtle.verify("Ed25519", key, signature, encoder.encode(canonical));
  } catch {
    // A stored public key that cannot be imported can never verify a signature.
    return false;
  }
}

/** Verifies one agent request; see the module docblock for the check order. */
export async function verifyRequest(input: VerifyRequestInput): Promise<VerifyResult> {
  const parsed = parseLeashHeaders(input.headers);
  if (!parsed.ok) {
    return { ok: false, code: "MALFORMED_HEADERS" };
  }

  const { agentId, timestamp, nonce, signature, signedAt } = parsed.value;

  const receivedAt = input.now.getTime();
  if (Math.abs(receivedAt - signedAt.getTime()) > TIMESTAMP_SKEW_MS) {
    return { ok: false, code: "STALE_TIMESTAMP" };
  }

  const publicKey = await input.resolvePublicKey(agentId);
  if (publicKey === null) {
    return { ok: false, code: "UNKNOWN_AGENT" };
  }

  const canonical = await canonicalRequest({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    body: input.body,
  });

  if (!(await verifySignature(publicKey, signature, canonical))) {
    return { ok: false, code: "BAD_SIGNATURE" };
  }

  const claimed = await input.nonceStore.claim(agentId, nonce, new Date(receivedAt + NONCE_TTL_MS));
  if (!claimed) {
    return { ok: false, code: "NONCE_REPLAY" };
  }

  return { ok: true, agentId };
}
