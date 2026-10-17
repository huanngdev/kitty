"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";
import { describeAuthError } from "../lib/auth-error";

export type VerifyEmailState =
  { status: "verifying" } | { status: "verified" } | { status: "invalid"; message: string };

export interface UseVerifyEmailResult {
  state: VerifyEmailState;
  /** Retry the verification after a transient failure. */
  retry: () => void;
}

/**
 * Consumes the verification token from `/verify-email?token=…` exactly once.
 * A `useQuery` (not an effect) keeps the request in server-state land and makes
 * the result cacheable/idempotent. The token is single-use; a second visit
 * shows the friendly "invalid or expired" state instead of crashing.
 */
export function useVerifyEmail(token: string | null): UseVerifyEmailResult {
  const query = useQuery({
    queryKey: ["auth", "verify-email", token],
    queryFn: async (): Promise<true> => {
      const { error } = await authClient.verifyEmail({
        query: { token: token ?? "" },
      });

      if (error !== null) {
        throw new Error(describeAuthError(error).message);
      }

      return true;
    },
    enabled: token !== null && token.length > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (token === null || token.length === 0) {
    return {
      state: { status: "invalid", message: "This verification link is missing its token." },
      retry: () => {},
    };
  }

  if (query.isSuccess) {
    return { state: { status: "verified" }, retry: () => {} };
  }

  if (query.isError) {
    return {
      state: {
        status: "invalid",
        message: query.error.message || "This link is invalid or has expired.",
      },
      retry: () => {
        void query.refetch();
      },
    };
  }

  return {
    state: { status: "verifying" },
    retry: () => {
      void query.refetch();
    },
  };
}

/** Where to go after a successful verification. */
export const verifiedRedirectPath = routes.events;
