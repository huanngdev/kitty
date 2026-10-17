import { createAuthClient } from "better-auth/react";
import { clientEnv } from "./env";

/**
 * Better Auth client for the web app. Requests target the public app URL and are
 * forwarded to `apps/api` by the Next `/api` proxy, so auth cookies stay
 * first-party. No sign-in UI yet.
 */
export const authClient = createAuthClient({
  baseURL: clientEnv.NEXT_PUBLIC_APP_URL,
});
