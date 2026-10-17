"use client";

import { useQuery } from "@tanstack/react-query";
import type { SocialProviderId } from "@kitty/shared/auth";
import { authConfigQueries } from "../api/auth-config.api";

export interface UseAuthConfigResult {
  providers: SocialProviderId[];
  demo: boolean;
  emailVerification: boolean;
  isLoading: boolean;
}

/**
 * Which provider buttons to render. An unreachable API hides every social
 * button (safe default: email + password always works) instead of rendering a
 * button that would start a broken OAuth flow.
 */
export function useAuthConfig(): UseAuthConfigResult {
  const query = useQuery(authConfigQueries.config());

  return {
    providers: query.data?.providers ?? [],
    demo: query.data?.demo ?? false,
    emailVerification: query.data?.emailVerification ?? false,
    isLoading: query.isPending,
  };
}
