import { createAuthClient } from "better-auth/react";
import { clientEnv } from "./env";

/**
 * Latest `X-Retry-After` (seconds) seen on an auth request. Better Auth returns
 * it on 429 so the UI can say "try again in 42 s" instead of a generic message;
 * the client library does not surface response headers, so we capture them here.
 */
let lastRetryAfterSeconds: number | null = null;

export function readLastRetryAfterSeconds(): number | null {
  return lastRetryAfterSeconds;
}

/**
 * Better Auth client for the web app. Requests target the public app URL and are
 * forwarded to `apps/api` by the Next `/api` proxy, so auth cookies stay
 * first-party (docs/25-code-architecture.md §1).
 */
export const authClient = createAuthClient({
  baseURL: clientEnv.NEXT_PUBLIC_APP_URL,
  fetchOptions: {
    onSuccess: () => {
      lastRetryAfterSeconds = null;
    },
    onError: (context) => {
      const header = context.response?.headers.get("x-retry-after") ?? null;
      const parsed = header === null ? Number.NaN : Number.parseInt(header, 10);

      lastRetryAfterSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    },
  },
});
