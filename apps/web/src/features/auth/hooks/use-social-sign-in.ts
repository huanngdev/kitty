"use client";

import type { SocialProviderId } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import { authClient, readLastRetryAfterSeconds } from "@/lib/auth-client";
import { buildAuthCallbackUrl, buildAuthErrorUrl } from "@/lib/routes";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";

export interface UseSocialSignInResult {
  signInWith: (provider: SocialProviderId) => void;
  /** Provider whose button is currently working, for per-button spinners. */
  pendingProvider: SocialProviderId | null;
  error: string | null;
}

/**
 * Starts the OAuth flow with GitHub or PayPal. Better Auth redirects the browser
 * to the provider; on return, `callbackURL`, `newUserCallbackURL` and
 * `errorCallbackURL` all come from the same same-origin guard as `?next=`.
 */
export function useSocialSignIn(nextPath: string | null): UseSocialSignInResult {
  const mutation = useMutation({
    mutationFn: async (provider: SocialProviderId): Promise<void> => {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: buildAuthCallbackUrl(nextPath),
        newUserCallbackURL: buildAuthCallbackUrl(nextPath),
        errorCallbackURL: buildAuthErrorUrl(),
      });

      if (error !== null) {
        throw new AuthFlowError(
          describeAuthError(error, {
            fallback: "Couldn't start sign-in. Try again.",
            retryAfterSeconds: readLastRetryAfterSeconds(),
          }),
        );
      }
    },
  });

  return {
    signInWith: (provider) => mutation.mutate(provider),
    pendingProvider: mutation.isPending ? (mutation.variables ?? null) : null,
    error: mutation.error === null ? null : mutation.error.message,
  };
}
