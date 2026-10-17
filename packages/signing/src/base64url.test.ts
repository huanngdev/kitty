import { describe, expect, test } from "bun:test";
import { decodeBase64Url, encodeBase64Url } from "./base64url";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("encodeBase64Url", () => {
  test("encodes the RFC 4648 test vectors without padding", () => {
    expect(encodeBase64Url(utf8(""))).toBe("");
    expect(encodeBase64Url(utf8("f"))).toBe("Zg");
    expect(encodeBase64Url(utf8("fo"))).toBe("Zm8");
    expect(encodeBase64Url(utf8("foo"))).toBe("Zm9v");
    expect(encodeBase64Url(utf8("foob"))).toBe("Zm9vYg");
    expect(encodeBase64Url(utf8("fooba"))).toBe("Zm9vYmE");
    expect(encodeBase64Url(utf8("foobar"))).toBe("Zm9vYmFy");
  });

  test("uses the URL-safe alphabet", () => {
    expect(encodeBase64Url(Uint8Array.from([0xfb, 0xff]))).toBe("-_8");
    expect(encodeBase64Url(Uint8Array.from([0xff, 0xff, 0xff]))).toBe("____");
  });
});

describe("decodeBase64Url", () => {
  test("decodes unpadded base64url", () => {
    expect(decodeBase64Url("Zm9vYmFy")).toEqual(utf8("foobar"));
    expect(decodeBase64Url("-_8")).toEqual(Uint8Array.from([0xfb, 0xff]));
    expect(decodeBase64Url("AA")).toEqual(Uint8Array.from([0x00]));
  });

  test("rejects malformed and non-canonical input", () => {
    expect(decodeBase64Url("")).toBeNull();
    expect(decodeBase64Url("A")).toBeNull();
    expect(decodeBase64Url("Zm9v=")).toBeNull();
    expect(decodeBase64Url("Zm9v*")).toBeNull();
    expect(decodeBase64Url("AB")).toBeNull();
  });
});
