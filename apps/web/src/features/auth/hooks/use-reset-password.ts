"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ResetPasswordInput, resetPasswordSchema } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { authClient, readLastRetryAfterSeconds } from "@/lib/auth-client";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";

export interface UseResetPasswordResult {
  form: UseFormReturn<ResetPasswordInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  isReset: boolean;
  formError: string | null;
  /** True when the token is missing, invalid or expired. */
  isTokenInvalid: boolean;
}

/**
 * Consumes the single-use reset token from the email. On success Better Auth
 * revokes every other session for the account (revokeSessionsOnPasswordReset),
 * so a stolen session cannot survive the reset.
 */
export function useResetPassword(token: string | null): UseResetPasswordResult {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: ResetPasswordInput): Promise<void> => {
      if (token === null || token.length === 0) {
        throw new AuthFlowError(describeAuthError({ code: "INVALID_TOKEN" }));
      }

      const { error } = await authClient.resetPassword({
        newPassword: values.newPassword,
        token,
      });

      if (error !== null) {
        throw new AuthFlowError(
          describeAuthError(error, {
            fallback: "Couldn't reset your password. Request a new link.",
            retryAfterSeconds: readLastRetryAfterSeconds(),
          }),
        );
      }
    },
  });

  const submit = form.handleSubmit(
    (values) => mutation.mutate(values),
    (errors) => {
      const invalid =
        errors.newPassword !== undefined
          ? "newPassword"
          : errors.confirmPassword !== undefined
            ? "confirmPassword"
            : null;

      if (invalid !== null) {
        form.setFocus(invalid);
      }
    },
  );

  const info = mutation.error instanceof AuthFlowError ? mutation.error.info : null;

  return {
    form,
    onSubmit: (event) => {
      event.preventDefault();
      void submit(event);
    },
    isSubmitting: mutation.isPending,
    isReset: mutation.isSuccess,
    formError: mutation.error === null ? null : mutation.error.message,
    isTokenInvalid:
      token === null || token.length === 0 || (info !== null && info.kind === "invalid_token"),
  };
}
