"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";
import { initialsFromName } from "../lib/initials";

export interface UseUserMenuResult {
  initials: string;
  signOut: () => void;
  isSigningOut: boolean;
}

/** Account menu state: avatar initials and the sign-out mutation. */
export function useUserMenu(name: string): UseUserMenuResult {
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await authClient.signOut();

      if (error !== null) {
        throw new Error("Could not sign you out. Try again.");
      }
    },
    onSuccess: () => {
      router.replace(routes.signIn);
      router.refresh();
    },
  });

  return {
    initials: initialsFromName(name),
    signOut: () => mutation.mutate(),
    isSigningOut: mutation.isPending,
  };
}
