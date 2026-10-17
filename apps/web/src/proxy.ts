import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthRedirect } from "@/lib/auth-redirect";

/**
 * Optimistic route protection (Next.js 16 proxy, formerly middleware).
 *
 * This only checks that a session cookie exists, per the Better Auth Next.js
 * guide — it never validates the session. The real check is
 * `getServerSession()` in `(app)/layout.tsx`.
 */
export function proxy(request: NextRequest): NextResponse {
  const redirect = resolveAuthRedirect({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasSessionCookie: getSessionCookie(request) !== null,
  });

  if (redirect !== null) {
    return NextResponse.redirect(new URL(redirect.redirectTo, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/events/:path*", "/settings/:path*", "/sign-in", "/sign-up"],
};
