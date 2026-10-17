"use client";

import { useEffect } from "react";

export interface UseEventsErrorResult {
  retry: () => void;
}

/**
 * Route-level error state: logs the digest for debugging and exposes the Next
 * `reset` callback to the retry button.
 */
export function useEventsError(reset: () => void): UseEventsErrorResult {
  useEffect(() => {
    // Keep the console useful in dev without rendering internals to the user.
    console.error("Failed to load /events");
  }, []);

  return { retry: reset };
}
