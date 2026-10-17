"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type PasswordStrength,
  type SignUpFormInput,
  passwordStrength,
  signUpFormSchema,
} from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { authClient, readLastRetryAfterSeconds } from "@/lib/auth-client";
import { buildAuthCallbackUrl, routes } from "@/lib/routes";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";
import { useAuthConfig } from "./use-auth-config";

export interface UseSignUpFormResult {
  form: UseFormReturn<SignUpFormInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  formError: string | null;
  strength: PasswordStrength;
}

/**
 * Sign-up form state and mutation.
 *
 * With email verification on, Better Auth creates the account and a session but
 * blocks app access until the address is confirmed, so we send the user to the
 * "check your inbox" screen. With verification off (development) they go
 * straight to the app and see the "verify your email" banner instead.
 */
export function useSignUpForm(): UseSignUpFormResult {
  const router = useRouter();
  const { emailVerification } = useAuthConfig();
  const form = useForm<SignUpFormInput>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    mode: "onSubmit",
  });
  const password = useWatch({ control: form.control, name: "password" });

  const mutation = useMutation({
    mutationFn: async (values: SignUpFormInput): Promise<void> => {
      const { error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
        callbackURL: buildAuthCallbackUrl(null),
      });

      if (error !== null) {
        throw new AuthFlowError(
          describeAuthError(error, {
            fallback: "Could not create your account. Try again.",
            retryAfterSeconds: readLastRetryAfterSeconds(),
          }),
        );
      }
    },
    onSuccess: (_data, values) => {
      if (emailVerification) {
        router.replace(
          `${routes.verifyEmail}?sent=1&email=${encodeURIComponent(values.email.trim())}`,
        );
        return;
      }

      router.replace(routes.events);
      router.refresh();
    },
  });

  const submit = form.handleSubmit(
    (values) => mutation.mutate(values),
    (errors) => {
      const invalid =
        errors.name !== undefined
          ? "name"
          : errors.email !== undefined
            ? "email"
            : errors.password !== undefined
              ? "password"
              : errors.confirmPassword !== undefined
                ? "confirmPassword"
                : null;

      if (invalid !== null) {
        form.setFocus(invalid);
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
    formError: mutation.error === null ? null : mutation.error.message,
    strength: passwordStrength(password),
  };
}
