import { buildSignInPath, routes } from "./routes";

/** Routes that require a session (the app area). */
export const PROTECTED_PREFIXES = [routes.events, "/settings"] as const;

/** Routes that only make sense when signed out. */
export const AUTH_ROUTES = [routes.signIn, routes.signUp] as const;

export type AuthRedirect = { redirectTo: string } | null;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Whether a pathname is one of the signed-out-only auth screens. */
export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route);
}

/**
 * Pure decision used by `proxy.ts` for the optimistic (cookie-only) redirect
 * away from the app area. The real session check lives in `(app)/layout.tsx` —
 * the proxy only avoids rendering the app shell for visitors with no session
 * cookie at all.
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

  return null;
}

/**
 * Whether a visitor with a *validated* session may skip the auth screens.
 *
 * This one must never be decided from the cookie alone: a stale or forged
 * `better-auth.session_token` is indistinguishable from a real one until the
 * API answers. Redirecting on the cookie alone makes `/sign-in` and `/events`
 * bounce off each other forever (`ERR_TOO_MANY_REDIRECTS`).
 */
export function resolveSignedInRedirect(input: {
  pathname: string;
  hasValidSession: boolean;
}): AuthRedirect {
  const { pathname, hasValidSession } = input;

  if (hasValidSession && isAuthRoute(pathname)) {
    return { redirectTo: routes.events };
  }

  return null;
}
