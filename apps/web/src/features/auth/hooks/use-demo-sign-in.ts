"use client";

import { apiPaths } from "@kitty/shared/api-paths";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ApiRequestError, http } from "@/lib/http";
import { routes } from "@/lib/routes";
import { demoLoginErrorMessage } from "../lib/auth-error";

export interface UseDemoSignInResult {
  signInAsDemo: () => void;
  isPending: boolean;
  error: string | null;
}

/**
 * Signs in as the seeded demo organizer through `POST /api/demo-sign-in`.
 * The password stays on the API; the browser only receives the session cookie.
 */
export function useDemoSignIn(): UseDemoSignInResult {
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      try {
        await http.post(apiPaths.authDemoSignIn);
      } catch (error) {
        if (error instanceof ApiRequestError) {
          throw new Error(demoLoginErrorMessage(error.code), { cause: error });
        }

        throw error;
      }
    },
    onSuccess: () => {
      router.replace(routes.events);
      router.refresh();
    },
  });

  return {
    signInAsDemo: () => mutation.mutate(),
    isPending: mutation.isPending,
    error: mutation.error === null ? null : mutation.error.message,
  };
}
