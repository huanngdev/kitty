import { QueryClient, isServer } from "@tanstack/react-query";
import { ApiRequestError } from "./http";

function isClientError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
}

/** Creates a QueryClient with Kitty defaults (30s stale time, no retry on 4xx). */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (isClientError(error)) {
            return false;
          }

          return failureCount < 3;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Server: a fresh client per request (never share cache between users).
 * Browser: a singleton so client navigations reuse the cache.
 */
export function getQueryClient(): QueryClient {
  if (isServer) {
    return makeQueryClient();
  }

  browserQueryClient ??= makeQueryClient();

  return browserQueryClient;
}
