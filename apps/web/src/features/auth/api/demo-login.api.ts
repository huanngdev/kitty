import { apiPaths } from "@kitty/shared/api-paths";
import { demoLoginStatusSchema, type DemoLoginStatus } from "@kitty/shared/auth";
import { queryOptions } from "@tanstack/react-query";
import { http } from "@/lib/http";

export const demoLoginKeys = {
  all: ["auth", "demo-login"] as const,
  status: () => [...demoLoginKeys.all, "status"] as const,
};

/** Fetches whether this deployment exposes the one-click demo login. */
export async function getDemoLoginStatus(): Promise<DemoLoginStatus> {
  const { data } = await http.get<unknown>(apiPaths.authDemoSignInStatus);

  return demoLoginStatusSchema.parse(data);
}

export const demoLoginQueries = {
  status: () =>
    queryOptions({
      queryKey: demoLoginKeys.status(),
      queryFn: getDemoLoginStatus,
      // Deployment config: it does not change while the tab is open.
      staleTime: 5 * 60 * 1000,
    }),
};
