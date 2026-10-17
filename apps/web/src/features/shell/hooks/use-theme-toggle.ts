"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

export interface UseThemeToggleResult {
  isDark: boolean;
  isMounted: boolean;
  toggleTheme: () => void;
}

function subscribe(): () => void {
  // Mount status never changes after the first client render.
  return () => undefined;
}

/**
 * Light/dark toggle. `isMounted` comes from `useSyncExternalStore` (false on the
 * server, true on the client) so the icon never mismatches during hydration.
 */
export function useThemeToggle(): UseThemeToggleResult {
  const { resolvedTheme, setTheme } = useTheme();
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const isDark = resolvedTheme === "dark";

  return {
    isDark,
    isMounted,
    toggleTheme: () => setTheme(isDark ? "light" : "dark"),
  };
}
