"use client";

import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { buildAuthCallbackUrl } from "@/lib/routes";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";
import { unwrapResult } from "../lib/unwrap";

export interface UseResendVerificationResult {
  resend: (email: string) => void;
  isPending: boolean;
  message: string | null;
  isError: boolean;
}

/** Sends another verification link (sign-in banner, verify-email notice, Settings). */
export function useResendVerification(nextPath: string | null = null): UseResendVerificationResult {
  const mutation = useMutation({
    mutationFn: async (email: string): Promise<void> => {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: buildAuthCallbackUrl(nextPath),
      });

      unwrapResult(result, "Couldn't resend the verification email. Try again.");
    },
  });

  return {
    resend: (email) => mutation.mutate(email),
    isPending: mutation.isPending,
    isError: mutation.isError,
    message: mutation.isSuccess
      ? "Verification email sent. Check your inbox."
      : mutation.error instanceof AuthFlowError
        ? mutation.error.message
        : mutation.error === null
          ? null
          : describeAuthError(mutation.error).message,
  };
}
