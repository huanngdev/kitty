"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type DeleteAccountInput, deleteAccountSchema } from "@kitty/shared/auth";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";
import { unwrapResult } from "../lib/unwrap";

export interface UseDeleteAccountResult {
  form: UseFormReturn<DeleteAccountInput>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isDeleting: boolean;
  formError: string | null;
  isDemo: boolean;
}

/**
 * Account deletion with a type-to-confirm gate. Demo accounts are read-only and
 * cannot delete themselves; the API rejects it too (`DEMO_READ_ONLY`).
 */
export function useDeleteAccount(isDemo: boolean): UseDeleteAccountResult {
  const router = useRouter();
  const form = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { confirm: "" as "DELETE" },
  });

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (isDemo) {
        throw new AuthFlowError(describeAuthError({ code: "DEMO_READ_ONLY" }));
      }

      const result = await authClient.deleteUser({});

      unwrapResult(result, "Couldn't delete your account.");
    },
    onSuccess: () => {
      router.replace(routes.home);
      router.refresh();
    },
  });

  const submit = form.handleSubmit(
    () => mutation.mutate(),
    () => {
      form.setFocus("confirm");
    },
  );

  return {
    form,
    onSubmit: (event) => {
      event.preventDefault();
      void submit(event);
    },
    isDeleting: mutation.isPending,
    formError: mutation.error === null ? null : mutation.error.message,
    isDemo,
  };
}
