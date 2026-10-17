"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SignUpInput, signUpSchema } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";
import { readAuthErrorMessage } from "../lib/auth-error";

export interface UseSignUpFormResult {
  form: UseFormReturn<SignUpInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  formError: string | null;
}

/** Sign-up form state and mutation; Better Auth signs the user in on success. */
export function useSignUpForm(): UseSignUpFormResult {
  const router = useRouter();
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: SignUpInput): Promise<void> => {
      const { error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });

      if (error !== null) {
        throw new Error(readAuthErrorMessage(error, "Could not create your account. Try again."));
      }
    },
    onSuccess: () => {
      router.replace(routes.events);
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
