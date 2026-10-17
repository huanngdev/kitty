import { describe, expect, test } from "bun:test";
import {
  AccountKeyError,
  accountKey,
  externalMember,
  externalPayee,
  isInternal,
  isKnownAccountKey,
  kittyAvailable,
  leashAvailable,
  leashHeld,
  parseAccountKey,
} from "./accounts";

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error("expected the call to throw");
}

describe("builders", () => {
  test("build the canonical keys of §8", () => {
    expect(kittyAvailable("kty_1")).toEqual({
      kind: "kitty",
      kittyId: "kty_1",
      bucket: "available",
    });
    expect(accountKey(kittyAvailable("kty_1"))).toBe("kitty:kty_1:available");
    expect(accountKey(leashAvailable("lsh_1"))).toBe("leash:lsh_1:available");
    expect(accountKey(leashHeld("lsh_1"))).toBe("leash:lsh_1:held");
    expect(accountKey(externalMember("mem_1"))).toBe("external:member:mem_1");
    expect(accountKey(externalPayee("bob@example.com"))).toBe("external:payee:bob@example.com");
  });

  test("lowercase and trim payee emails so one vendor is one account", () => {
    expect(externalPayee("  Bob@Example.COM  ")).toEqual({
      kind: "external-payee",
      payeeEmail: "bob@example.com",
    });
    expect(accountKey(externalPayee("BOB@EXAMPLE.COM"))).toBe("external:payee:bob@example.com");
  });

  test("reject empty or colon-bearing ids", () => {
    expect(() => kittyAvailable("")).toThrow(AccountKeyError);
    expect(() => kittyAvailable("a:b")).toThrow(AccountKeyError);
    expect(() => leashAvailable("")).toThrow(AccountKeyError);
    expect(() => leashAvailable("a:b")).toThrow(AccountKeyError);
    expect(() => leashHeld("")).toThrow(AccountKeyError);
    expect(() => externalMember("")).toThrow(AccountKeyError);
    expect(() => externalMember("a:b")).toThrow(AccountKeyError);
  });

  test("reject emails that are not emails", () => {
    expect(() => externalPayee("not-an-email")).toThrow(AccountKeyError);
    expect(() => externalPayee("")).toThrow(AccountKeyError);
    expect(() => externalPayee("a@b")).toThrow(AccountKeyError);
    expect(() => externalPayee("a b@c.com")).toThrow(AccountKeyError);
  });

  test("throws a typed error naming the offending field", () => {
    const error = captureError(() => kittyAvailable(""));

    if (!(error instanceof AccountKeyError)) {
      throw new Error("expected an AccountKeyError");
    }

    expect(error.name).toBe("AccountKeyError");
    expect(error.code).toBe("ACCOUNT_KEY");
    expect(error.key).toBe("kittyId");
    expect(error.message).toContain("kittyId");
  });
});

describe("parseAccountKey", () => {
  test("round-trips every account kind", () => {
    for (const ref of [
      kittyAvailable("kty_1"),
      leashAvailable("lsh_1"),
      leashHeld("lsh_1"),
      externalMember("mem_1"),
      externalPayee("bob@example.com"),
    ]) {
      expect(parseAccountKey(accountKey(ref))).toEqual(ref);
    }
  });

  test("normalizes payee emails", () => {
    expect(parseAccountKey("external:payee:BOB@EXAMPLE.COM")).toEqual(
      externalPayee("bob@example.com"),
    );
  });

  test.each([
    "bogus:thing",
    "kitty:kty_1",
    "kitty:kty_1:held",
    "kitty:kty_1:available:extra",
    "kitty::available",
    "leash:lsh_1",
    "leash:lsh_1:spent",
    "leash::available",
    "external:vendor:bob@example.com",
    "external:member:mem_1:extra",
    "external:member:",
    "external:payee:",
    "external:payee:bob@example.com:extra",
    "",
  ])("rejects %p", (key) => {
    expect(() => parseAccountKey(key)).toThrow(AccountKeyError);
  });
});

describe("isInternal", () => {
  test("is true only for kitty and leash buckets", () => {
    expect(isInternal(kittyAvailable("kty_1"))).toBe(true);
    expect(isInternal(leashAvailable("lsh_1"))).toBe(true);
    expect(isInternal(leashHeld("lsh_1"))).toBe(true);
    expect(isInternal(externalMember("mem_1"))).toBe(false);
    expect(isInternal(externalPayee("bob@example.com"))).toBe(false);
  });
});

describe("isKnownAccountKey", () => {
  test("accepts canonical keys and rejects everything else", () => {
    expect(isKnownAccountKey("kitty:kty_1:available")).toBe(true);
    expect(isKnownAccountKey("leash:lsh_1:held")).toBe(true);
    expect(isKnownAccountKey("external:member:mem_1")).toBe(true);
    expect(isKnownAccountKey("external:payee:bob@example.com")).toBe(true);
    expect(isKnownAccountKey("kitty:kty_1:held")).toBe(false);
    expect(isKnownAccountKey("bogus:thing")).toBe(false);
  });
});
