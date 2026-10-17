/**
 * `Leash-*` header names and the shapes accepted when reading them back.
 *
 * Header lookup is case-insensitive (HTTP header names are), and callers may
 * pass either a `Headers` instance (`new Headers(...)`, Hono's `c.req.raw.headers`,
 * a fetch `Request`) or a plain record — so the same helper works in the
 * gateway, in tests, and in a client that builds a JSON-RPC request.
 */

export const leashHeaderNames = {
  agent: "Leash-Agent",
  timestamp: "Leash-Timestamp",
  nonce: "Leash-Nonce",
  signature: "Leash-Signature",
} as const;

/**
 * The four headers every agent request to the gateway must carry (docs/05 §5).
 *
 * Declared as a type alias, not an interface: a header bag must stay assignable
 * to `Record<string, string | undefined>` (implicit index signature), otherwise
 * callers could not hand a `LeashHeaders` value to `verifyRequest`.
 */
export type LeashHeaders = {
  "Leash-Agent": string;
  "Leash-Timestamp": string;
  "Leash-Nonce": string;
  "Leash-Signature": string;
};

/** Anything with a `Headers`-style `get(name)` method. */
export interface HeaderGetter {
  get(name: string): string | null | undefined;
}

/** Accepted header sources: a `Headers`-like object, or a plain record. */
export type HeaderSource = HeaderGetter | Readonly<Record<string, string | undefined>>;

/**
 * Reads a header case-insensitively, returning `null` when it is absent, empty
 * or not a string.
 */
export function readHeader(source: HeaderSource, name: string): string | null {
  if (typeof source.get === "function") {
    return source.get(name) ?? null;
  }

  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(source)) {
    if (key.toLowerCase() === wanted && typeof value === "string") {
      return value;
    }
  }

  return null;
}
