/**
 * Crypto helpers for the Gateway Admin API (docs/10-api-spec.md §1).
 *
 * Everything uses WebCrypto (`crypto.subtle`) so there is no Node-only API and
 * no dependency beyond the runtime. All comparisons are constant-time.
 */

const textEncoder = new TextEncoder();

/**
 * Compares two strings in constant time (with respect to their content).
 *
 * The byte lengths are compared first — a length difference is not secret —
 * then every byte is folded into an accumulator so the loop always runs the
 * full length of the shorter buffer.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = textEncoder.encode(a);
  const right = textEncoder.encode(b);

  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

/**
 * Hex HMAC-SHA256 of `message` under `key`.
 *
 * The admin request signature is
 * `HMAC-SHA256(key = GATEWAY_ADMIN_TOKEN, message = userId + "\n" + timestamp + "\n" + rawBody)`.
 */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(message));

  return toHex(new Uint8Array(signature));
}
