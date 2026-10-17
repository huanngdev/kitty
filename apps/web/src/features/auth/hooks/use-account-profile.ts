"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type UpdateProfileInput, updateProfileSchema } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";
import { unwrapResult } from "../lib/unwrap";

export interface UseAccountProfileResult {
  form: UseFormReturn<UpdateProfileInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSaving: boolean;
  formError: string | null;
  saved: boolean;
  isDemo: boolean;
}

/** Display-name editing in Settings → Account. */
export function useAccountProfile(initialName: string, isDemo: boolean): UseAccountProfileResult {
  const router = useRouter();
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: initialName },
  });

  const mutation = useMutation({
    mutationFn: async (values: UpdateProfileInput): Promise<void> => {
      const result = await authClient.updateUser({ name: values.name.trim() });

      unwrapResult(result, "Couldn't save your name. Try again.");
    },
    onSuccess: () => {
      router.refresh();
    },
  });

  const submit = form.handleSubmit(
    (values) => {
      if (isDemo) return;
      mutation.mutate(values);
    },
    (errors) => {
      if (errors.name !== undefined) form.setFocus("name");
    },
  );

  const info = mutation.error instanceof AuthFlowError ? mutation.error.info : null;

  return {
    form,
    onSubmit: (event) => {
      event.preventDefault();
      void submit(event);
    },
    isSaving: mutation.isPending,
    formError:
      info?.kind === "demo_read_only"
        ? "The demo account is read-only."
        : mutation.error === null
          ? null
          : mutation.error.message || describeAuthError(mutation.error).message,
    saved: mutation.isSuccess,
    isDemo,
  };
}
