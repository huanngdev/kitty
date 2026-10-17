/**
 * Pure decision table for the Better Auth `hooks.before` guard (ADR-029).
 *
 * Kept out of `auth.ts` so every combination can be unit-tested without a
 * database or a Better Auth instance; the middleware there only gathers the
 * inputs (session, body email, demo lookup) and switches on the result.
 */

/** Sensitive endpoints a demo (`is_demo`) account may never call. */
export const DEMO_BLOCKED_PATHS = [
  "/change-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/unlink-account",
  // Judges share the demo accounts: linking a personal GitHub/PayPal would
  // permanently attach it, and revoking sessions would sign every other judge
  // out. `/set-password` is the same credential change as change-password.
  "/link-social",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/revoke-session",
  "/set-password",
] as const;

/**
 * Password-reset request endpoints. `/forget-password` is not a core Better
 * Auth 1.7 route (the email-OTP plugin owns that name) but is listed so the
 * guard stays correct if a plugin mounts it.
 */
export const RESET_REQUEST_PATHS = ["/request-password-reset", "/forget-password"] as const;

export function isDemoBlockedPath(path: string): boolean {
  return (DEMO_BLOCKED_PATHS as readonly string[]).includes(path);
}

export function isResetRequestPath(path: string): boolean {
  return (RESET_REQUEST_PATHS as readonly string[]).includes(path);
}

export type GuardAction =
  /** Let the request through to Better Auth. */
  | { readonly type: "allow" }
  /** 403 DEMO_READ_ONLY: demo accounts are read-only. */
  | { readonly type: "demo_read_only" }
  /**
   * Answer with the generic "if this email exists…" success without sending
   * anything: either the address is a demo account, or this deployment cannot
   * deliver reset emails (production without a transactional mailer).
   */
  | { readonly type: "silent_reset_success" };

export interface GuardInput {
  readonly path: string;
  /** False in production when no transactional mailer is configured. */
  readonly passwordResetAvailable: boolean;
  /** Whether the request has a demo session (`null` when signed out). */
  readonly sessionIsDemo: boolean | null;
  /** Whether the reset email belongs to a demo account (`null` when unknown). */
  readonly emailIsDemo: boolean | null;
}

export function resolveGuardAction(input: GuardInput): GuardAction {
  const { path, passwordResetAvailable, sessionIsDemo, emailIsDemo } = input;

  if (isResetRequestPath(path)) {
    if (!passwordResetAvailable) {
      return { type: "silent_reset_success" };
    }

    return emailIsDemo === true ? { type: "silent_reset_success" } : { type: "allow" };
  }

  if (isDemoBlockedPath(path) && sessionIsDemo === true) {
    return { type: "demo_read_only" };
  }

  return { type: "allow" };
}
