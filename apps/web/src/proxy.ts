import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isAuthRoute, resolveAuthRedirect, resolveSignedInRedirect } from "@/lib/auth-redirect";
import { readSession } from "@/lib/server-session";

/** Cookie prefix configured in apps/api (`advanced.cookiePrefix`, ADR-029). */
const COOKIE_PREFIX = "kitty";

/** Better Auth's session cookie, plus the `__Secure-` variant used over HTTPS. */
const SESSION_COOKIE_NAMES = [
  `${COOKIE_PREFIX}.session_token`,
  `__Secure-${COOKIE_PREFIX}.session_token`,
] as const;

/**
 * Route protection (Next.js 16 proxy, formerly middleware).
 *
 * Two different decisions run here:
 *
 * 1. Away from the app area we stay optimistic: no session cookie at all means
 *    the visitor is redirected to `/sign-in?next=…`. `(app)/layout.tsx` does the
 *    real check for the cookie case.
 * 2. Away from `/sign-in` and `/sign-up` we must be certain. The cookie alone
 *    cannot be trusted: after a database reset or a secret rotation a stale
 *    cookie is still "present", so redirecting on it would bounce between
 *    `/sign-in` and `/events` forever. `readSession()` asks `apps/api`, and an
 *    invalid cookie is cleared before the form renders.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = getSessionCookie(request, { cookiePrefix: COOKIE_PREFIX }) !== null;

  const redirect = resolveAuthRedirect({ pathname, search, hasSessionCookie });

  if (redirect !== null) {
    return NextResponse.redirect(new URL(redirect.redirectTo, request.url));
  }

  if (!hasSessionCookie || !isAuthRoute(pathname)) {
    return NextResponse.next();
  }

  const session = await readSession(request.headers.get("cookie") ?? "");
  const signedInRedirect = resolveSignedInRedirect({
    pathname,
    hasValidSession: session !== null,
  });

  if (signedInRedirect !== null) {
    return NextResponse.redirect(new URL(signedInRedirect.redirectTo, request.url));
  }

  const response = NextResponse.next();

  if (session === null) {
    // Let the visitor sign in with the same browser instead of carrying a
    // cookie that will never resolve to a session.
    for (const name of SESSION_COOKIE_NAMES) {
      response.cookies.delete(name);
    }
  }

  return response;
}

export const config = {
  matcher: ["/events/:path*", "/settings/:path*", "/sign-in", "/sign-up"],
};
