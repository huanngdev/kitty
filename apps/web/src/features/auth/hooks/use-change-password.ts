"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ChangePasswordInput, changePasswordSchema } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";
import { unwrapResult } from "../lib/unwrap";

export interface UseChangePasswordResult {
  form: UseFormReturn<ChangePasswordInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSaving: boolean;
  formError: string | null;
  saved: boolean;
  isDemo: boolean;
}

/**
 * Password change from Settings → Account. Requires the current password and a
 * fresh session (`freshAge`), and revokes every other session so a stolen
 * session cannot outlive the change.
 */
export function useChangePassword(isDemo: boolean): UseChangePasswordResult {
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: ChangePasswordInput): Promise<void> => {
      if (isDemo) {
        throw new AuthFlowError(describeAuthError({ code: "DEMO_READ_ONLY" }));
      }

      const result = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      });

      unwrapResult(result, "Couldn't change your password.");
    },
    onSuccess: () => {
      form.reset();
    },
  });

  const submit = form.handleSubmit(
    (values) => mutation.mutate(values),
    (errors) => {
      const invalid =
        errors.currentPassword !== undefined
          ? "currentPassword"
          : errors.newPassword !== undefined
            ? "newPassword"
            : errors.confirmPassword !== undefined
              ? "confirmPassword"
              : null;

      if (invalid !== null) form.setFocus(invalid);
    },
  );

  return {
    form,
    onSubmit: (event) => {
      event.preventDefault();
      void submit(event);
    },
    isSaving: mutation.isPending,
    formError: mutation.error === null ? null : mutation.error.message,
    saved: mutation.isSuccess,
    isDemo,
  };
}
