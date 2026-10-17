"use client";

import { type SocialProviderId, socialProviderIdSchema } from "@kitty/shared/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { buildAuthCallbackUrl, routes } from "@/lib/routes";
import { AuthFlowError, describeAuthError } from "../lib/auth-error";
import { unwrapResult } from "../lib/unwrap";

const linkedAccountSchema = z.looseObject({
  id: z.string(),
  providerId: z.string(),
  accountId: z.string(),
});

export type LinkedAccount = z.infer<typeof linkedAccountSchema>;

export const linkedAccountKeys = {
  all: ["auth", "linked-accounts"] as const,
};

export interface UseLinkedAccountsResult {
  accounts: LinkedAccount[];
  isLoading: boolean;
  link: (provider: SocialProviderId) => void;
  unlink: (accountId: string) => void;
  /** Account row currently linking/unlinking, for per-row spinners. */
  pendingAccountId: string | null;
  pendingProvider: SocialProviderId | null;
  /** Blocks removing the only sign-in method left (ADR-029). */
  canUnlink: (providerId: string) => boolean;
  error: string | null;
  message: string | null;
}

/**
 * Linked sign-in methods in Settings → Account. GitHub/PayPal can be linked
 * with `linkSocial` and removed with `unlinkAccount` (by account row id, not
 * provider — Better Auth 1.7). The last remaining method can never be removed;
 * Better Auth enforces it too, the UI just explains it.
 */
export function useLinkedAccounts(): UseLinkedAccountsResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: linkedAccountKeys.all,
    queryFn: async (): Promise<LinkedAccount[]> => {
      const result = await authClient.listAccounts();

      return z
        .array(linkedAccountSchema)
        .parse(unwrapResult(result, "Couldn't load your linked accounts."));
    },
  });

  const accounts = query.data ?? [];

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: linkedAccountKeys.all });
  };

  const linkMutation = useMutation({
    mutationFn: async (provider: SocialProviderId): Promise<void> => {
      const result = await authClient.linkSocial({
        provider,
        callbackURL: buildAuthCallbackUrl(routes.accountSettings),
      });

      unwrapResult(result, "Couldn't start linking this provider.");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (accountId: string): Promise<void> => {
      if (accounts.length <= 1) {
        throw new AuthFlowError(
          describeAuthError(undefined, {
            fallback: "Add another sign-in method before removing this one.",
          }),
        );
      }

      const result = await authClient.unlinkAccount({ accountId });

      unwrapResult(result, "Couldn't unlink this provider.");
    },
    onSuccess: invalidate,
  });

  const socialOnly = (providerId: string): boolean =>
    socialProviderIdSchema.safeParse(providerId).success;

  return {
    accounts,
    isLoading: query.isPending,
    link: (provider) => linkMutation.mutate(provider),
    unlink: (accountId) => unlinkMutation.mutate(accountId),
    pendingProvider: linkMutation.isPending ? (linkMutation.variables ?? null) : null,
    pendingAccountId: unlinkMutation.isPending ? (unlinkMutation.variables ?? null) : null,
    canUnlink: (providerId) => socialOnly(providerId) && accounts.length > 1,
    error:
      unlinkMutation.error !== null
        ? unlinkMutation.error.message
        : linkMutation.error !== null
          ? linkMutation.error.message
          : query.error !== null
            ? query.error.message
            : null,
    message: unlinkMutation.isSuccess ? "Sign-in method removed." : null,
  };
}
