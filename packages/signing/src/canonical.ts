/**
 * The canonical request string that agents sign (docs/05 §5):
 *
 * ```
 * "leash-v1\n" + METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + sha256_hex(BODY)
 * ```
 *
 * Rules settled here (see docs/05 §5):
 * - `METHOD` is uppercased.
 * - `PATH` is the request target exactly as sent: pathname + query, never the host.
 * - `BODY` is hashed over the raw request bytes; a `string` body is encoded as
 *   UTF-8. An empty body therefore hashes the empty byte string.
 * - `TIMESTAMP` / `NONCE` are inserted verbatim; none of the four framed
 *   components may contain CR or LF.
 */

import { sha256Hex } from "./hash";

export const LEASH_SIGNATURE_VERSION = "leash-v1";

/** Request body input: raw bytes, or a string that will be UTF-8 encoded. */
export type RequestBody = Uint8Array | string;

export interface CanonicalRequestInput {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: RequestBody;
}

const encoder = new TextEncoder();

/** Normalises a body to the exact bytes that are hashed. */
export function toBodyBytes(body: RequestBody): Uint8Array {
  return typeof body === "string" ? encoder.encode(body) : body;
}

/** Builds the canonical string for the given request components. */
export async function canonicalRequest(input: CanonicalRequestInput): Promise<string> {
  const bodyHash = await sha256Hex(toBodyBytes(input.body));

  return [
    LEASH_SIGNATURE_VERSION,
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    bodyHash,
  ].join("\n");
}
