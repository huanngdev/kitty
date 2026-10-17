import { buildCallbackUrl, safeNextPath } from "@kitty/shared/auth";
import { clientEnv } from "./env";

/** App routes used by navigation, redirects and proxy rules. */
export const routes = {
  home: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  authError: "/auth/error",
  events: "/events",
  newEvent: "/events/new",
  settings: "/settings/account",
  accountSettings: "/settings/account",
  aiSettings: "/settings/ai",
} as const;

/**
 * Builds the sign-in URL, preserving the requested page in `?next=` when it is
 * a safe same-origin path (docs/23-user-screen-flow.md §7: deep links survive
 * the sign-in round trip).
 */
export function buildSignInPath(nextPath?: string | null): string {
  const safeNext = safeNextPath(nextPath);

  if (safeNext === null) {
    return routes.signIn;
  }

  return `${routes.signIn}?next=${encodeURIComponent(safeNext)}`;
}

/**
 * Reads `?next=` from Next.js `searchParams` (which can be a string, an array or
 * absent) and keeps it only when it is a safe same-origin path.
 */
export function readNextPath(
  searchParams: Record<string, string | string[] | undefined>,
): string | null {
  const value = searchParams.next;

  return safeNextPath(typeof value === "string" ? value : null);
}

/**
 * Absolute in-app URL used as the OAuth `callbackURL`, `newUserCallbackURL` or
 * `errorCallbackURL`. It goes through the same guard as `?next=`, so a forged
 * value can never turn a callback into an off-site redirect.
 */
export function buildAuthCallbackUrl(nextPath?: string | null): string {
  return buildCallbackUrl(clientEnv.NEXT_PUBLIC_APP_URL, nextPath, routes.events);
}

/** Absolute URL of the friendly OAuth error page. */
export function buildAuthErrorUrl(): string {
  return new URL(routes.authError, clientEnv.NEXT_PUBLIC_APP_URL).toString();
}
