import { apiPaths } from "@kitty/shared/api-paths";
import { healthResponseSchema, type HealthResponse } from "@kitty/shared/health";
import { queryOptions } from "@tanstack/react-query";
import { http } from "@/lib/http";

export const systemKeys = {
  all: ["system"] as const,
  health: () => [...systemKeys.all, "health"] as const,
};

/** Fetches and validates the backend health payload. */
export async function getHealth(): Promise<HealthResponse> {
  const { data } = await http.get<unknown>(apiPaths.health);

  return healthResponseSchema.parse(data);
}

export const systemQueries = {
  health: () =>
    queryOptions({
      queryKey: systemKeys.health(),
      queryFn: getHealth,
    }),
};
