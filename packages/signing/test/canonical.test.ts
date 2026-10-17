import { describe, expect, test } from "bun:test";
import { canonicalRequest, LEASH_SIGNATURE_VERSION, toBodyBytes } from "../src/canonical";
import { sha256Hex } from "../src/hash";
import { formatTimestamp, parseTimestamp, TIMESTAMP_SKEW_MS } from "../src/timestamp";

const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" });
const request = {
  method: "post",
  path: "/mcp?kitty=kty_x",
  timestamp: "2026-11-02T08:15:30Z",
  nonce: "AAECAwQFBgcICQoLDA0ODw",
  body,
};

describe("sha256Hex", () => {
  test("hashes the empty body to the well-known digest", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("toBodyBytes", () => {
  test("UTF-8 encodes string bodies and passes bytes through", () => {
    expect(toBodyBytes("héllo")).toEqual(new TextEncoder().encode("héllo"));

    const bytes = Uint8Array.from([1, 2, 3]);
    expect(toBodyBytes(bytes)).toBe(bytes);
  });
});

describe("canonicalRequest", () => {
  test("joins the six components with newlines and uppercases the method", async () => {
    const canonical = await canonicalRequest(request);
    const expected = [
      LEASH_SIGNATURE_VERSION,
      "POST",
      "/mcp?kitty=kty_x",
      "2026-11-02T08:15:30Z",
      "AAECAwQFBgcICQoLDA0ODw",
      await sha256Hex(new TextEncoder().encode(body)),
    ].join("\n");

    expect(canonical).toBe(expected);
    expect(canonical.startsWith("leash-v1\nPOST\n")).toBe(true);
  });

  test("treats an empty body as the empty byte string", async () => {
    const emptyHash = await sha256Hex(new Uint8Array());

    const canonical = await canonicalRequest({ ...request, body: "" });

    expect(canonical.endsWith(`\n${emptyHash}`)).toBe(true);
    expect(canonical).toBe(await canonicalRequest({ ...request, body: new Uint8Array() }));
  });

  test("hashes equivalent string and byte bodies identically", async () => {
    const fromString = await canonicalRequest(request);
    const fromBytes = await canonicalRequest({ ...request, body: new TextEncoder().encode(body) });

    expect(fromString).toBe(fromBytes);
  });
});

describe("timestamps", () => {
  test("formats to RFC 3339 UTC second precision", () => {
    expect(formatTimestamp(new Date("2026-11-02T08:15:30.789Z"))).toBe("2026-11-02T08:15:30Z");
    expect(formatTimestamp(new Date(0))).toBe("1970-01-01T00:00:00Z");
  });

  test("parses only the wire format", () => {
    expect(parseTimestamp("2026-11-02T08:15:30Z")?.toISOString()).toBe("2026-11-02T08:15:30.000Z");
    expect(parseTimestamp("2026-11-02T08:15:30.789Z")).toBeNull();
    expect(parseTimestamp("2026-11-02 08:15:30")).toBeNull();
    expect(parseTimestamp("2026-13-01T00:00:00Z")).toBeNull();
  });

  test("exposes the 60 second skew window", () => {
    expect(TIMESTAMP_SKEW_MS).toBe(60_000);
  });
});
