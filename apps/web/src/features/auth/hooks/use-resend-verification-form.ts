"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useResendVerification } from "./use-resend-verification";

export interface UseResendVerificationFormResult {
  email: string;
  setEmail: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canSubmit: boolean;
  isPending: boolean;
  message: string | null;
  isError: boolean;
}

/** Email field + submit for the "check your inbox" screen. */
export function useResendVerificationForm(
  initialEmail: string | null,
): UseResendVerificationFormResult {
  const [email, setEmail] = useState(initialEmail ?? "");
  const { resend, isPending, message, isError } = useResendVerification(null);

  return {
    email,
    setEmail,
    onSubmit: (event) => {
      event.preventDefault();
      resend(email.trim());
    },
    canSubmit: email.trim().length > 0 && !isPending,
    isPending,
    message,
    isError,
  };
}
