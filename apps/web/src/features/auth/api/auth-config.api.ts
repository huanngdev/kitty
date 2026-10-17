import { apiPaths } from "@kitty/shared/api-paths";
import { type AuthConfigPayload, authConfigSchema } from "@kitty/shared/auth";
import { queryOptions } from "@tanstack/react-query";
import { http } from "@/lib/http";

export const authConfigKeys = {
  all: ["auth", "config"] as const,
  config: () => [...authConfigKeys.all, "config"] as const,
};

/** Which sign-in methods this deployment configured (never a secret). */
export async function getAuthConfig(): Promise<AuthConfigPayload> {
  const { data } = await http.get<unknown>(apiPaths.authConfig);

  return authConfigSchema.parse(data);
}

export const authConfigQueries = {
  config: () =>
    queryOptions({
      queryKey: authConfigKeys.config(),
      queryFn: getAuthConfig,
      // Deployment config: it does not change while the tab is open.
      staleTime: 5 * 60 * 1000,
    }),
};
