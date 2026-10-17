"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SignInInput, signInSchema } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { authClient, readLastRetryAfterSeconds } from "@/lib/auth-client";
import { buildAuthCallbackUrl, routes } from "@/lib/routes";
import { type AuthErrorKind, AuthFlowError, describeAuthError } from "../lib/auth-error";

export interface UseSignInFormResult {
  form: UseFormReturn<SignInInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  formError: string | null;
  errorKind: AuthErrorKind | null;
  /** Sends another verification email for the address currently typed in. */
  resendVerification: () => void;
  isResending: boolean;
  resendMessage: string | null;
}

/**
 * Sign-in form state and mutation. `nextPath` is a validated same-origin path
 * from `?next=`; after success the user lands back on the page they asked for.
 */
export function useSignInForm(nextPath: string | null): UseSignInFormResult {
  const router = useRouter();
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const mutation = useMutation({
    mutationFn: async (values: SignInInput): Promise<void> => {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
        callbackURL: buildAuthCallbackUrl(nextPath),
      });

      if (error !== null) {
        throw new AuthFlowError(
          describeAuthError(error, {
            fallback: "Could not sign you in. Check your email and password.",
            retryAfterSeconds: readLastRetryAfterSeconds(),
          }),
        );
      }
    },
    onSuccess: () => {
      router.replace(nextPath ?? routes.events);
      router.refresh();
    },
  });

  const resend = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await authClient.sendVerificationEmail({
        email: form.getValues("email"),
        callbackURL: buildAuthCallbackUrl(nextPath),
      });

      if (error !== null) {
        throw new AuthFlowError(
          describeAuthError(error, { fallback: "Couldn't resend the email. Try again later." }),
        );
      }
    },
  });

  const submit = form.handleSubmit(
    (values) => mutation.mutate(values),
    (errors) => {
      const invalid =
        errors.email !== undefined ? "email" : errors.password !== undefined ? "password" : null;

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
    formError: mutation.error === null ? null : mutation.error.message,
    errorKind: info?.kind ?? null,
    resendVerification: () => resend.mutate(),
    isResending: resend.isPending,
    resendMessage:
      resend.isSuccess === false && resend.error === null
        ? null
        : resend.isSuccess
          ? "Verification email sent. Check your inbox."
          : resend.error === null
            ? null
            : resend.error.message,
  };
}
