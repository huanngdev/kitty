import { describe, expect, test } from "bun:test";
import { decodeBase64Url } from "../src/base64url";
import { canonicalRequest } from "../src/canonical";
import { generateAgentKeyPair, importPublicKey } from "../src/keys";
import { NONCE_BYTES, randomNonce, signRequest, SIGNATURE_ALGORITHM } from "../src/sign";

const agentId = "agt_01JBXR7Q0J0Q4QTP8W3G8V0S3K";
const now = new Date("2026-11-02T08:15:30.789Z");
const baseInput = {
  agentId,
  method: "post",
  path: "/mcp?kitty=kty_01JBXR7Q0J0Q4QTP8W3G8V0S3K",
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" }),
  now,
};
const keyPair = await generateAgentKeyPair();
const privateKey = keyPair.privateKey;

describe("randomNonce", () => {
  test("returns 16 random bytes as base64url", () => {
    const nonce = randomNonce();

    expect(decodeBase64Url(nonce)?.length).toBe(NONCE_BYTES);
    expect(randomNonce()).not.toBe(nonce);
  });
});

describe("signRequest", () => {
  test("returns the four Leash headers", async () => {
    const headers = await signRequest({ ...baseInput, privateKey });

    expect(Object.keys(headers).toSorted()).toEqual([
      "Leash-Agent",
      "Leash-Nonce",
      "Leash-Signature",
      "Leash-Timestamp",
    ]);
    expect(headers["Leash-Agent"]).toBe(agentId);
    expect(headers["Leash-Timestamp"]).toBe("2026-11-02T08:15:30Z");
    expect(decodeBase64Url(headers["Leash-Nonce"])?.length).toBe(NONCE_BYTES);
    expect(headers["Leash-Signature"].startsWith(`${SIGNATURE_ALGORITHM}=`)).toBe(true);
  });

  test("signs the canonical string with the agent private key", async () => {
    const headers = await signRequest({ ...baseInput, privateKey });
    const canonical = await canonicalRequest({
      method: baseInput.method,
      path: baseInput.path,
      timestamp: headers["Leash-Timestamp"],
      nonce: headers["Leash-Nonce"],
      body: baseInput.body,
    });
    const signature = decodeBase64Url(headers["Leash-Signature"].slice("ed25519=".length));
    if (signature === null) {
      throw new Error("signature is not base64url");
    }
    const publicKey = await importPublicKey(keyPair.publicKey);

    expect(
      await crypto.subtle.verify(
        "Ed25519",
        publicKey,
        signature,
        new TextEncoder().encode(canonical),
      ),
    ).toBe(true);
  });

  test("is deterministic for a fixed key, timestamp and nonce", async () => {
    const fixed = { ...baseInput, privateKey, nonce: "AAECAwQFBgcICQoLDA0ODw" };

    expect(await signRequest(fixed)).toEqual(await signRequest(fixed));
  });

  test("accepts a body as raw bytes", async () => {
    const nonce = randomNonce();

    const asString = await signRequest({ ...baseInput, privateKey, nonce });
    const asBytes = await signRequest({
      ...baseInput,
      privateKey,
      nonce,
      body: new TextEncoder().encode(baseInput.body),
    });

    expect(asBytes["Leash-Signature"]).toBe(asString["Leash-Signature"]);
  });
});
