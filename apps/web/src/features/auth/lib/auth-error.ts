/** Maps Better Auth client errors to a sentence we can show under the form. */
export function readAuthErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) {
    return fallback;
  }

  if ("message" in error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (
    "statusText" in error &&
    typeof error.statusText === "string" &&
    error.statusText.trim().length > 0
  ) {
    return error.statusText.trim();
  }

  return fallback;
}

/**
 * Friendly copy for the server-side demo login. The API returns stable codes,
 * never anything about the demo password (AGENTS.md invariant #11).
 */
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
