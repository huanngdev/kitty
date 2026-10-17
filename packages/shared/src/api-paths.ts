/**
 * API path constants shared by the web app, the API and the gateway so a route
 * is never spelled out twice.
 */
export const apiPaths = {
  health: "/health",
  /** Base path of the Better Auth handler mounted by `apps/api`. */
  auth: "/api/auth",
  /** Server-side demo login: sets the session cookie without exposing the password. */
  authDemoSignIn: "/demo-sign-in",
  /** Reports whether this deployment enabled the one-click demo login. */
  authDemoSignInStatus: "/demo-sign-in/status",
} as const;

export type ApiPaths = typeof apiPaths;
