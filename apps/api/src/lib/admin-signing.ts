/**
 * Gateway Admin API request signing (docs/10-api-spec.md §1).
 *
 * This is a deliberate re-implementation of the verifier in
 * `apps/gateway/src/admin/auth.ts`: the admin token never leaves the two
 * services, so the web BFF / `apps/api` keeps its own copy of the format.
 * `apps/api/src/lib/admin-signing.test.ts` and
 * `apps/gateway/src/admin/auth.test.ts` pin the same known-answer vector, so the
 * two implementations cannot drift.
 *
 * WebCrypto only (`crypto.subtle`) — no Node-only API.
 */

const textEncoder = new TextEncoder();

/** The four headers every `/v1` request must carry. */
export const ADMIN_AUTH_HEADERS = {
  authorization: "Authorization",
  user: "X-Kitty-User",
  timestamp: "X-Kitty-Timestamp",
  signature: "X-Kitty-Signature",
} as const;

/** The exact string that is HMAC-signed for an admin request. */
export function adminSignatureMessage(userId: string, timestamp: string, rawBody: string): string {
  return `${userId}\n${timestamp}\n${rawBody}`;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

/** Hex HMAC-SHA256 of `message` under `key` (the gateway's signature primitive). */
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

export interface SignAdminRequestInput {
  readonly token: string;
  readonly userId: string;
  /** Raw request body exactly as it will be sent; `""` for GET/HEAD. */
  readonly body?: string;
  /** Unix epoch **seconds**; defaults to now. */
  readonly timestamp?: number;
}

/**
 * Produces the four admin auth headers for a request. The body must be the
 * exact bytes that go on the wire: callers stringify once and send that same
 * string.
 */
export async function signAdminRequest(
  input: SignAdminRequestInput,
): Promise<Record<string, string>> {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const rawBody = input.body ?? "";
  const signature = await hmacSha256Hex(
    input.token,
    adminSignatureMessage(input.userId, timestamp, rawBody),
  );

  return {
    [ADMIN_AUTH_HEADERS.authorization]: `Bearer ${input.token}`,
    [ADMIN_AUTH_HEADERS.user]: input.userId,
    [ADMIN_AUTH_HEADERS.timestamp]: timestamp,
    [ADMIN_AUTH_HEADERS.signature]: signature,
  };
}
