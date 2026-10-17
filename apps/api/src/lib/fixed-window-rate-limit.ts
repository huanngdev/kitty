/**
 * In-memory fixed-window rate limiter.
 *
 * Deliberately tiny: the demo login runs on a single Render instance, so a
 * process-local counter is enough to keep the public demo button from being
 * hammered. A multi-instance deployment would move this to Redis/Postgres.
 */
export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the current window ends (0 when allowed). */
  retryAfterSeconds: number;
}

export interface FixedWindowRateLimiter {
  /** Counts one request for `key` and reports whether it is allowed. */
  check: (key: string, now?: number) => RateLimitDecision;
}

interface WindowState {
  windowStart: number;
  count: number;
}

/** Prune expired windows once the map grows past this size. */
const PRUNE_THRESHOLD = 1_000;

export function createFixedWindowRateLimiter(options: {
  limit: number;
  windowMs: number;
}): FixedWindowRateLimiter {
  const { limit, windowMs } = options;
  const windows = new Map<string, WindowState>();

  function prune(now: number): void {
    if (windows.size < PRUNE_THRESHOLD) {
      return;
    }

    for (const [key, state] of windows) {
      if (now - state.windowStart >= windowMs) {
        windows.delete(key);
      }
    }
  }

  return {
    check: (key: string, now: number = Date.now()): RateLimitDecision => {
      prune(now);

      const state = windows.get(key);

      if (state === undefined || now - state.windowStart >= windowMs) {
        windows.set(key, { windowStart: now, count: 1 });

        return { allowed: true, retryAfterSeconds: 0 };
      }

      state.count += 1;

      if (state.count > limit) {
        const remainingMs = windowMs - (now - state.windowStart);

        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000)) };
      }

      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
