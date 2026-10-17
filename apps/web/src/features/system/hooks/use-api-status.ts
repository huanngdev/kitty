"use client";

import { useQuery } from "@tanstack/react-query";
import { systemQueries } from "../api/system.api";

export type ApiStatus = "loading" | "online" | "offline";

export interface UseApiStatusResult {
  status: ApiStatus;
}

/** Reports whether the backend is reachable through the `/api` proxy. */
export function useApiStatus(): UseApiStatusResult {
  const query = useQuery(systemQueries.health());

  if (query.isPending) {
    return { status: "loading" };
  }

  if (query.isError) {
    return { status: "offline" };
  }

  return { status: query.data.ok ? "online" : "offline" };
}
