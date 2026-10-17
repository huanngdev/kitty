import { safeNextPath } from "@kitty/shared/auth";

/** App routes used by navigation, redirects and proxy rules. */
export const routes = {
  home: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  events: "/events",
  newEvent: "/events/new",
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
