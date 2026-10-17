"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SignInInput, signInSchema } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";
import { readAuthErrorMessage } from "../lib/auth-error";

export interface UseSignInFormResult {
  form: UseFormReturn<SignInInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  formError: string | null;
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
  });

  const mutation = useMutation({
    mutationFn: async (values: SignInInput): Promise<void> => {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (error !== null) {
        throw new Error(
          readAuthErrorMessage(error, "Could not sign you in. Check your email and password."),
        );
      }
    },
    onSuccess: () => {
      router.replace(nextPath ?? routes.events);
      router.refresh();
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    void form.handleSubmit((values) => mutation.mutate(values))(event);
  };

  return {
    form,
    onSubmit,
    isSubmitting: mutation.isPending,
    formError: mutation.error === null ? null : mutation.error.message,
  };
}
