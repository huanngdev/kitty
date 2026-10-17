import { describe, expect, test } from "bun:test";
import { createFixedWindowRateLimiter } from "./fixed-window-rate-limit";

describe("createFixedWindowRateLimiter", () => {
  test("allows up to the limit and then reports a retry delay", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });

    expect(limiter.check("ip", 0)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.check("ip", 1)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.check("ip", 2)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  test("keeps a separate window per key", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 1_000 });

    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 0).allowed).toBe(false);
    expect(limiter.check("b", 0).allowed).toBe(true);
  });

  test("resets once the window has passed", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 1_000 });

    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 999).allowed).toBe(false);
    expect(limiter.check("ip", 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  test("counts attempts within a window even after a denial", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 10_000 });

    limiter.check("ip", 0);
    expect(limiter.check("ip", 1).retryAfterSeconds).toBe(10);
    expect(limiter.check("ip", 5_000).retryAfterSeconds).toBe(5);
  });
});
