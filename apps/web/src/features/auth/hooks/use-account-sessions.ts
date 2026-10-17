"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { unwrapResult } from "../lib/unwrap";

const sessionEntrySchema = z.looseObject({
  id: z.string(),
  token: z.string().optional(),
  ipAddress: z.string().nullish(),
  userAgent: z.string().nullish(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
});

export type AccountSession = z.infer<typeof sessionEntrySchema>;

export const sessionListKeys = {
  all: ["auth", "sessions"] as const,
};

export interface UseAccountSessionsResult {
  sessions: AccountSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  revoke: (token: string) => void;
  revokeAllOthers: () => void;
  isRevoking: boolean;
  error: string | null;
  message: string | null;
}

/**
 * Active sessions for the signed-in user (Settings → Account). Each row can be
 * revoked individually; "Sign out of all other devices" keeps the current one.
 */
export function useAccountSessions(): UseAccountSessionsResult {
  const queryClient = useQueryClient();
  const current = authClient.useSession();

  const query = useQuery({
    queryKey: sessionListKeys.all,
    queryFn: async (): Promise<AccountSession[]> => {
      const result = await authClient.listSessions();

      return z
        .array(sessionEntrySchema)
        .parse(unwrapResult(result, "Couldn't load your sessions."));
    },
  });

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: sessionListKeys.all });
  };

  const revokeMutation = useMutation({
    mutationFn: async (token: string): Promise<void> => {
      unwrapResult(await authClient.revokeSession({ token }), "Couldn't revoke that session.");
    },
    onSuccess: invalidate,
  });

  const revokeOthersMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      unwrapResult(await authClient.revokeOtherSessions(), "Couldn't sign out the other devices.");
    },
    onSuccess: invalidate,
  });

  return {
    sessions: query.data ?? [],
    currentSessionId: current.data?.session.id ?? null,
    isLoading: query.isPending,
    revoke: (token) => revokeMutation.mutate(token),
    revokeAllOthers: () => revokeOthersMutation.mutate(),
    isRevoking: revokeMutation.isPending || revokeOthersMutation.isPending,
    error:
      query.error !== null
        ? query.error.message
        : revokeMutation.error !== null
          ? revokeMutation.error.message
          : revokeOthersMutation.error !== null
            ? revokeOthersMutation.error.message
            : null,
    message: revokeOthersMutation.isSuccess ? "Signed out of all other devices." : null,
  };
}
