/**
 * Best-effort client IP for rate limiting.
 *
 * Render terminates TLS in front of the service and sets `x-forwarded-for`
 * (left-most entry is the original client). `x-real-ip` covers other
 * proxies. When neither is present — local dev without a proxy — every caller
 * shares the `"unknown"` bucket, which is the safe default (one client cannot
 * escape the limit by omitting headers, because the bucket is shared).
 */
export function clientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");

  if (forwardedFor !== null) {
    const first = forwardedFor.split(",")[0]?.trim();

    if (first !== undefined && first.length > 0) {
      return first;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();

  if (realIp !== undefined && realIp.length > 0) {
    return realIp;
  }

  return "unknown";
}
