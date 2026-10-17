import { buildSignInPath, routes } from "./routes";

/** Routes that require a session (the app area). */
export const PROTECTED_PREFIXES = [routes.events, "/settings"] as const;

/** Routes that only make sense when signed out. */
export const AUTH_ROUTES = [routes.signIn, routes.signUp] as const;

export type AuthRedirect = { redirectTo: string } | null;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Pure decision used by `proxy.ts` for the optimistic (cookie-only) redirect.
 * The real session check lives in `(app)/layout.tsx` — the proxy only avoids
 * rendering the app shell for visitors with no session cookie at all.
 */
export function resolveAuthRedirect(input: {
  pathname: string;
  search?: string;
  hasSessionCookie: boolean;
}): AuthRedirect {
  const { pathname, search = "", hasSessionCookie } = input;

  if (!hasSessionCookie && matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    return { redirectTo: buildSignInPath(`${pathname}${search}`) };
  }

  if (hasSessionCookie && AUTH_ROUTES.some((route) => pathname === route)) {
    return { redirectTo: routes.events };
  }

  return null;
}
