"use client";

import { useQuery } from "@tanstack/react-query";
import { demoLoginQueries } from "../api/demo-login.api";

export interface UseDemoLoginStatusResult {
  enabled: boolean;
  isLoading: boolean;
}

/**
 * Whether to show the demo button. Unknown/unreachable API resolves to
 * `enabled: false` (plus `isLoading` while the first request is in flight), so
 * the button never appears on a deployment that has demo login switched off.
 */
export function useDemoLoginStatus(): UseDemoLoginStatusResult {
  const query = useQuery(demoLoginQueries.status());

  return {
    enabled: query.data?.enabled ?? false,
    isLoading: query.isPending,
  };
}
