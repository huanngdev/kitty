/**
 * Timestamp helpers for the `Leash-Timestamp` header.
 *
 * Wire format is RFC 3339 UTC at **second precision**, for example
 * `2026-11-02T08:15:30Z` (docs/05 §5). Because the timestamp is part of the
 * canonical string, it must be byte-for-byte reproducible by both sides — hence
 * the strict pattern instead of a lenient `Date.parse`.
 */

/** Maximum accepted clock skew between agent and gateway (docs/05 §5). */
export const TIMESTAMP_SKEW_MS = 60_000;

const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Formats a `Date` as `YYYY-MM-DDTHH:MM:SSZ`, truncating sub-second precision.
 *
 * Throws a `RangeError` for an invalid date, like `Date.prototype.toISOString`.
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Parses the wire timestamp format, returning `null` when the value does not
 * match the pattern or is not a real instant (for example month `13`).
 */
export function parseTimestamp(value: string): Date | null {
  if (!timestampPattern.test(value)) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}
