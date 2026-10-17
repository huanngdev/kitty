import type { IdPrefix } from "@kitty/shared";

/**
 * ULID generation for gateway-owned ids (AGENTS.md §6: `<prefix>_<ULID>`).
 *
 * Crockford base32, 26 characters: the first 10 encode the millisecond
 * timestamp, the last 16 are random. Uses WebCrypto so there is no `Buffer`.
 */

/** Crockford base32 alphabet (no I, L, O, U). */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(milliseconds: number): string {
  let remaining = milliseconds;
  let encoded = "";

  for (let index = 0; index < 10; index += 1) {
    const mod = remaining % 32;
    encoded = ENCODING.charAt(mod) + encoded;
    remaining = (remaining - mod) / 32;
  }

  return encoded;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);

  let bits = 0n;

  for (const byte of bytes) {
    bits = (bits << 8n) | BigInt(byte);
  }

  let encoded = "";

  for (let index = 0; index < 16; index += 1) {
    encoded = ENCODING.charAt(Number(bits & 31n)) + encoded;
    bits >>= 5n;
  }

  return encoded;
}

/** A fresh ULID body (26 Crockford base32 characters). */
export function ulid(milliseconds: number = Date.now()): string {
  return encodeTime(milliseconds) + encodeRandom();
}

/** A new prefixed id, e.g. `newId(idPrefixes.kitty)` → `kty_01J…`. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

/** A ledger transaction group id (`leash.ledger_entries.txn_id`). */
export function newTxnId(): string {
  return `txn_${ulid()}`;
}
