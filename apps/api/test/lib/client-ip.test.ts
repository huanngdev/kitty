import { describe, expect, test } from "bun:test";
import { clientIp } from "../../src/lib/client-ip";

describe("clientIp", () => {
  test("uses the left-most x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });

    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  test("falls back to x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  test("shares one bucket when no proxy headers are present", () => {
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});
