import { describe, expect, test } from "bun:test";
import { idPrefixes } from "@kitty/shared";
import { newId, newTxnId, ulid } from "./ids";

describe("ulid", () => {
  test("produces 26 Crockford base32 characters", () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test("encodes the timestamp so later ids sort after earlier ones", () => {
    expect(ulid(1_700_000_000_000) < ulid(1_700_000_001_000)).toBe(true);
  });

  test("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => ulid()));
    expect(ids.size).toBe(200);
  });
});

describe("newId", () => {
  test("prefixes the ULID with the domain prefix", () => {
    expect(newId(idPrefixes.kitty)).toMatch(/^kty_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(newId(idPrefixes.leash)).toMatch(/^lsh_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe("newTxnId", () => {
  test("uses the txn_ prefix", () => {
    expect(newTxnId()).toMatch(/^txn_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
