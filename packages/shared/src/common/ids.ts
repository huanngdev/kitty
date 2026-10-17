import { z } from "zod";

/**
 * ID prefixes. IDs are ULIDs with a domain prefix so they are readable in logs
 * (AGENTS.md §6). Each prefix belongs to one entity type.
 */
export const idPrefixes = {
  event: "evt",
  kitty: "kty",
  leash: "lsh",
  spendIntent: "int",
  agent: "agt",
  approval: "apr",
  contribution: "ctr",
  member: "mem",
  vendor: "ven",
  budgetLine: "bdl",
  task: "tsk",
} as const;

export type IdPrefix = (typeof idPrefixes)[keyof typeof idPrefixes];

/** Crockford base32 ULID body: 26 characters, no I/L/O/U. */
const ulidBody = "[0-9A-HJKMNP-TV-Z]{26}";

/** Validates `<prefix>_<ULID>`, for example `evt_01J...`. */
export function idSchema(prefix: IdPrefix): z.ZodString {
  return z.string().regex(new RegExp(`^${prefix}_${ulidBody}$`));
}

/** Crockford base32 alphabet (no I, L, O, U). */
const encoding = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(milliseconds: number): string {
  let remaining = milliseconds;
  let encoded = "";

  for (let index = 0; index < 10; index += 1) {
    const mod = remaining % 32;
    encoded = encoding.charAt(mod) + encoded;
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
    encoded = encoding.charAt(Number(bits & 31n)) + encoded;
    bits >>= 5n;
  }

  return encoded;
}

/**
 * A fresh ULID body (26 Crockford base32 characters: the millisecond timestamp
 * then 16 random characters, so lexicographic order follows creation order).
 *
 * WebCrypto only, so it works in the browser and in every Bun/Node runtime.
 */
export function ulid(milliseconds: number = Date.now()): string {
  return encodeTime(milliseconds) + encodeRandom();
}

/** A new prefixed id, e.g. `newId(idPrefixes.kitty)` → `kty_01J…` (AGENTS.md §6). */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}
