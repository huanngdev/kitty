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
  task: "tsk",
} as const;

export type IdPrefix = (typeof idPrefixes)[keyof typeof idPrefixes];

/** Crockford base32 ULID body: 26 characters, no I/L/O/U. */
const ulidBody = "[0-9A-HJKMNP-TV-Z]{26}";

/** Validates `<prefix>_<ULID>`, for example `evt_01J...`. */
export function idSchema(prefix: IdPrefix): z.ZodString {
  return z.string().regex(new RegExp(`^${prefix}_${ulidBody}$`));
}
