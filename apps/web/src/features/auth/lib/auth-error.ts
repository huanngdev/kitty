/**
 * Maps Better Auth client errors to friendly UI copy (docs/23 F1, §6 states).
 *
 * Better Auth returns stable machine codes; the raw messages are terse and
 * sometimes leak implementation details. Everything the user sees comes from
 * this module, so both forms and the OAuth error page speak the same language.
 * Never include the submitted email or password in the copy.
 */
export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_verified"
  | "rate_limited"
  | "account_exists"
  | "oauth_denied"
  | "session_not_fresh"
  | "invalid_token"
  | "demo_read_only"
  | "network"
  | "unknown";

export interface AuthErrorInfo {
  readonly kind: AuthErrorKind;
  readonly message: string;
  /** Seconds to wait before retrying, when the server sent a retry-after. */
  readonly retryAfterSeconds: number | null;
}

/** Error carrying user-facing copy through TanStack Query mutations. */
export class AuthFlowError extends Error {
  constructor(readonly info: AuthErrorInfo) {
    super(info.message);
    this.name = "AuthFlowError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Better Auth wraps the API body in `error`, but plain errors carry `code`. */
export function authErrorCode(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  if (typeof error.code === "string" && error.code.length > 0) {
    return error.code;
  }

  if (
    isRecord(error.error) &&
    typeof error.error.code === "string" &&
    error.error.code.length > 0
  ) {
    return error.error.code;
  }

  return null;
}

function authErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  return typeof error.status === "number" ? error.status : null;
}

/** Kept for backward compatibility with the existing tests and callers. */
export function readAuthErrorMessage(error: unknown, fallback: string): string {
  if (!isRecord(error)) {
    return fallback;
  }

  if (typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error.statusText === "string" && error.statusText.trim().length > 0) {
    return error.statusText.trim();
  }

  return fallback;
}

function retryAfterFrom(error: unknown, retryAfterSeconds: number | null): string {
  if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
    return `Too many attempts. Try again in ${retryAfterSeconds} second${
      retryAfterSeconds === 1 ? "" : "s"
    }.`;
  }

  if (authErrorStatus(error) === 429) {
    return "Too many attempts. Try again in a minute.";
  }

  return "Something went wrong. Try again.";
}

export interface DescribeAuthErrorOptions {
  /** Fallback sentence for codes we do not know. */
  readonly fallback?: string;
  /** `X-Retry-After` captured by the auth client (seconds). */
  readonly retryAfterSeconds?: number | null;
}

export function describeAuthError(
  error: unknown,
  options: DescribeAuthErrorOptions = {},
): AuthErrorInfo {
  const code = authErrorCode(error);
  const retryAfterSeconds = options.retryAfterSeconds ?? null;
  const fallback = options.fallback ?? "Something went wrong. Try again.";

  const info = (kind: AuthErrorKind, message: string): AuthErrorInfo => ({
    kind,
    message,
    retryAfterSeconds,
  });

  if (authErrorStatus(error) === 429 || code === "RATE_LIMITED" || code === "TOO_MANY_REQUESTS") {
    return info("rate_limited", retryAfterFrom(error, retryAfterSeconds));
  }

  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "CREDENTIALS_SIGN_IN_FAILED":
      return info("invalid_credentials", "Email or password is incorrect.");
    case "EMAIL_NOT_VERIFIED":
      return info(
        "email_not_verified",
        "Verify your email first — check your inbox for the link we sent.",
      );
    case "USER_ALREADY_EXISTS":
    case "EMAIL_ALREADY_EXISTS":
    case "ACCOUNT_EXISTS":
      return info(
        "account_exists",
        "An account with this email already exists. Sign in with your password, then link this provider from Settings → Account.",
      );
    case "ACCOUNT_NOT_LINKED":
    case "UNABLE_TO_LINK_ACCOUNT":
    case "provider_email_not_verified":
      return info(
        "account_exists",
        "An account with this email already exists. Sign in with your password, then link this provider from Settings → Account.",
      );
    case "EMAIL_DOES_NOT_MATCH":
      return info(
        "account_exists",
        "That provider uses a different email. Sign in with the email on your Kitty account, then link it from Settings → Account.",
      );
    case "SESSION_NOT_FRESH":
      return info(
        "session_not_fresh",
        "For your security, sign in again before changing credentials.",
      );
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return info("invalid_token", "This link is invalid or has expired. Request a new one.");
    case "DEMO_READ_ONLY":
      return info(
        "demo_read_only",
        "The demo account is read-only. Create an account to change settings.",
      );
    case "access_denied":
    case "OAUTH_CALLBACK_ERROR":
      return info("oauth_denied", "Sign-in was cancelled or denied. You can try again.");
    default:
      break;
  }

  if (authErrorStatus(error) === 401) {
    return info("invalid_credentials", "Email or password is incorrect.");
  }

  if (isRecord(error) && error.name === "TypeError") {
    return info("network", "Couldn't reach Kitty. Check your connection and try again.");
  }

  // Never echo raw server/provider text: it can leak internals or reflect input.
  return info("unknown", fallback);
}

/**
 * Friendly copy for `/auth/error` — Better Auth redirects OAuth failures there
 * with `?error=<code>`. Always offer a way back to the sign-in screen.
 */
export function oauthErrorMessage(code: string | null): string {
  switch (code) {
    case null:
      return "We couldn't finish signing you in. Try again.";
    case "access_denied":
    case "user_cancelled":
      return "Sign-in was cancelled. No account was connected.";
    case "account_not_linked":
    case "unable_to_link_account":
    case "provider_email_not_verified":
      return "An account with this email already exists. Sign in with your password, then link this provider from Settings → Account.";
    case "email_doesn't_match":
    case "email_does_not_match":
      return "That provider uses a different email. Sign in with the email on your Kitty account, then link it from Settings → Account.";
    case "signup_disabled":
      return "Account creation is turned off on this deployment.";
    case "state_mismatch":
    case "invalid_state":
      return "This sign-in link expired or was already used. Start again.";
    case "email_not_verified":
      return "Verify your email before signing in. Check your inbox for the link.";
    case "too_many_requests":
      return "Too many attempts. Wait a minute and try again.";
    default:
      return "We couldn't finish signing you in. Try again.";
  }
}

/** Friendly copy for the server-side demo login (never mentions the password). */
export function demoLoginErrorMessage(code: string | null): string {
  switch (code) {
    case "DEMO_LOGIN_NOT_CONFIGURED":
    case "DEMO_LOGIN_FAILED":
      return "The demo account isn't available yet. Sign in with your email instead.";
    case "DEMO_LOGIN_DISABLED":
      return "Demo login is turned off on this deployment. Sign in with your email instead.";
    case "RATE_LIMITED":
      return "Too many demo sign-in attempts. Try again in a few minutes.";
    case null:
      return "Could not start the demo. Try again.";
    default:
      return "Could not start the demo. Try again.";
  }
}
