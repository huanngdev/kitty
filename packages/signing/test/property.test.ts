import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { decodeBase64Url, encodeBase64Url } from "../src/base64url";
import { generateAgentKeyPair } from "../src/keys";
import { createMemoryNonceStore } from "../src/nonce-store";
import { signRequest } from "../src/sign";
import { formatTimestamp } from "../src/timestamp";
import { verifyRequest, type VerifyFailureCode, type VerifyRequestInput } from "../src/verify";

/**
 * Property tests. The canonical string is a `\n`-joined message, so `METHOD`,
 * `PATH`, `TIMESTAMP` and `NONCE` are drawn from a line-safe alphabet — the same
 * assumption the gateway makes, since HTTP request lines and header values
 * cannot carry CR/LF. Bodies are arbitrary bytes: they are hashed, never framed.
 */
const lineSafeCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~/?=";

function lineSafeString(maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...lineSafeCharacters.split("")), { maxLength })
    .map((characters) => characters.join(""));
}

const agentId = "agt_01JBXR7Q0J0Q4QTP8W3G8V0S3K";
const keyPair = await generateAgentKeyPair();
const now = new Date("2026-11-02T08:15:30.000Z");

interface Request {
  method: string;
  path: string;
  body: string;
  nonce: string;
  /** Clock offset from `now`, kept inside the ±60s window with room to spare. */
  offsetMs: number;
}

const requestArbitrary: fc.Arbitrary<Request> = fc.record({
  method: lineSafeString(8),
  path: lineSafeString(25).map((suffix) => `/${suffix}`),
  body: fc.string(),
  nonce: fc.uint8Array({ minLength: 16, maxLength: 16 }).map(encodeBase64Url),
  offsetMs: fc.integer({ min: -55_000, max: 55_000 }),
});

function requestTime(request: Request): Date {
  return new Date(now.getTime() + request.offsetMs);
}

async function signedHeaders(request: Request): Promise<Record<string, string>> {
  return signRequest({
    agentId,
    privateKey: keyPair.privateKey,
    method: request.method,
    path: request.path,
    body: request.body,
    now: requestTime(request),
    nonce: request.nonce,
  });
}

function verifyInput(request: Request, headers: VerifyRequestInput["headers"]): VerifyRequestInput {
  return {
    headers,
    method: request.method,
    path: request.path,
    body: request.body,
    now: requestTime(request),
    resolvePublicKey: async (id) => (id === agentId ? keyPair.publicKey : null),
    nonceStore: createMemoryNonceStore(),
  };
}

interface Mutated {
  input: VerifyRequestInput;
  code: VerifyFailureCode;
}

/** Mutates exactly one signed component, guaranteeing the value changes. */
function mutate(request: Request, headers: Record<string, string>, kind: number): Mutated {
  const base = verifyInput(request, headers);

  switch (kind) {
    case 0:
      return { input: { ...base, method: `${request.method}X` }, code: "BAD_SIGNATURE" };
    case 1:
      return { input: { ...base, path: `${request.path}x` }, code: "BAD_SIGNATURE" };
    case 2:
      return { input: { ...base, body: `${request.body}!` }, code: "BAD_SIGNATURE" };
    case 3:
      return {
        input: {
          ...base,
          headers: {
            ...headers,
            // One second earlier than the signed timestamp: still inside the window.
            "Leash-Timestamp": formatTimestamp(new Date(requestTime(request).getTime() - 1_000)),
          },
        },
        code: "BAD_SIGNATURE",
      };
    case 4:
      return {
        input: { ...base, headers: { ...headers, "Leash-Nonce": `${request.nonce}A` } },
        code: "BAD_SIGNATURE",
      };
    default:
      return {
        input: { ...base, headers: { ...headers, "Leash-Agent": `${agentId}X` } },
        code: "UNKNOWN_AGENT",
      };
  }
}

describe("base64url properties", () => {
  test("round-trips arbitrary bytes", () => {
    // The empty byte string is deliberately rejected by the strict decoder
    // (an empty nonce or signature is malformed), so start at one byte.
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1 }), (bytes) => {
        const decoded = decodeBase64Url(encodeBase64Url(bytes));

        expect(decoded).not.toBeNull();
        expect(Array.from(decoded ?? [])).toEqual(Array.from(bytes));
      }),
      { numRuns: 300 },
    );
  });

  test("always emits the URL-safe, unpadded alphabet", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (bytes) => {
        expect(encodeBase64Url(bytes)).toMatch(/^[A-Za-z0-9_-]*$/);
      }),
      { numRuns: 200 },
    );
  });
});

describe("signing properties", () => {
  test("sign then verify accepts any well-formed request", async () => {
    await fc.assert(
      fc.asyncProperty(requestArbitrary, async (request) => {
        const headers = await signedHeaders(request);

        expect(await verifyRequest(verifyInput(request, headers))).toEqual({ ok: true, agentId });
      }),
      { numRuns: 150 },
    );
  });

  test("any single-component mutation of a signed request fails verification", async () => {
    await fc.assert(
      fc.asyncProperty(requestArbitrary, fc.integer({ min: 0, max: 5 }), async (request, kind) => {
        const headers = await signedHeaders(request);
        const mutation = mutate(request, headers, kind);
        const result = await verifyRequest(mutation.input);

        expect(result).toEqual({ ok: false, code: mutation.code });
      }),
      { numRuns: 200 },
    );
  });

  test("accepts any Headers-style getter", async () => {
    await fc.assert(
      fc.asyncProperty(requestArbitrary, async (request) => {
        const headers = await signedHeaders(request);
        const stored = new Map(
          Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
        );
        const getter = {
          get: (name: string): string | undefined => stored.get(name.toLowerCase()),
        };

        expect(await verifyRequest(verifyInput(request, getter))).toEqual({ ok: true, agentId });
      }),
      { numRuns: 50 },
    );
  });
});
