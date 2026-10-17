"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ForgotPasswordInput, forgotPasswordSchema } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { authClient, readLastRetryAfterSeconds } from "@/lib/auth-client";
import { routes } from "@/lib/routes";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";

export interface UseForgotPasswordResult {
  form: UseFormReturn<ForgotPasswordInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  isSent: boolean;
  formError: string | null;
}

/**
 * Requests a password reset link. The screen always ends on the same "check
 * your inbox" message, whether or not the address exists — no account
 * enumeration (docs/14, ADR-029).
 */
export function useForgotPassword(): UseForgotPasswordResult {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: ForgotPasswordInput): Promise<void> => {
      const { error } = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: routes.resetPassword,
      });

      if (error !== null) {
        throw new AuthFlowError(
          describeAuthError(error, {
            fallback: "Couldn't send the reset email. Try again.",
            retryAfterSeconds: readLastRetryAfterSeconds(),
          }),
        );
      }
    },
  });

  const submit = form.handleSubmit(
    (values) => mutation.mutate(values),
    (errors) => {
      if (errors.email !== undefined) {
        form.setFocus("email");
      }
    },
  );

  return {
    form,
    onSubmit: (event) => {
      event.preventDefault();
      void submit(event);
    },
    isSubmitting: mutation.isPending,
    isSent: mutation.isSuccess,
    formError: mutation.error === null ? null : mutation.error.message,
  };
}
