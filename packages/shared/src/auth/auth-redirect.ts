/**
 * Open-redirect guard for post-auth navigation.
 *
 * `?next=` may only ever point inside this app. The guard is deliberately
 * paranoid because it protects the moment right after a successful sign-in:
 *
 * - absolute URLs (`https://evil.example`), scheme-relative URLs (`//evil`),
 *   backslash tricks (`/\evil`, `/\\evil`) and encoded variants (`/%2F%2Fevil`,
 *   double-encoded) are rejected;
 * - control characters and percent-decoding failures are rejected;
 * - the surviving value is normalized through `URL` so the browser and the
 *   redirect cannot disagree about what the path means.
 *
 * Returns `null` for anything unsafe; callers fall back to `/events`.
 */
const MAX_NEXT_PATH_LENGTH = 2_048;
const MAX_DECODE_PASSES = 3;
const DUMMY_ORIGIN = "https://next-path.invalid";

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function fullyDecode(value: string): string | null {
  let current = value;

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    let decoded: string;

    try {
      decoded = decodeURIComponent(current);
    } catch {
      // Malformed percent-encoding: never hand it to the router.
      return null;
    }

    if (decoded === current) {
      return current;
    }

    current = decoded;
  }

  // Still changing after the maximum number of passes — refuse instead of guessing.
  return current.includes("%") ? null : current;
}

function isUnsafePath(value: string): boolean {
  return (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTERS.test(value)
  );
}

export function safeNextPath(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value.length === 0 || value.length > MAX_NEXT_PATH_LENGTH || value !== value.trim()) {
    return null;
  }

  if (isUnsafePath(value)) {
    return null;
  }

  const decoded = fullyDecode(value);

  if (decoded === null || decoded.length === 0 || isUnsafePath(decoded)) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(decoded, DUMMY_ORIGIN);
  } catch {
    return null;
  }

  // A value that escaped the dummy origin would have become an absolute URL.
  if (url.origin !== DUMMY_ORIGIN) {
    return null;
  }

  const normalized = `${url.pathname}${url.search}${url.hash}`;

  return isUnsafePath(normalized) ? null : normalized;
}

/**
 * Picks the post-auth destination: the validated `next` path when present,
 * otherwise the caller's fallback (normally `/events`).
 */
export function resolveNextPath(value: string | null | undefined, fallback: string): string {
  return safeNextPath(value) ?? fallback;
}

/**
 * Builds an absolute URL on this app's origin for an OAuth `callbackURL`,
 * `newUserCallbackURL` or `errorCallbackURL`. Only the validated path ever
 * leaves the app, so a forged `?next=` cannot turn an OAuth callback into an
 * off-site redirect.
 */
export function buildCallbackUrl(
  origin: string,
  value: string | null | undefined,
  fallback: string,
): string {
  return new URL(resolveNextPath(value, fallback), origin).toString();
}
