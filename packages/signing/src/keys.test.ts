import { describe, expect, test } from "bun:test";
import { decodeBase64Url } from "./base64url";
import { generateAgentKeyPair, importPrivateKey, importPublicKey } from "./keys";

describe("generateAgentKeyPair", () => {
  test("exports a base64url raw public key and a PKCS#8 private key", async () => {
    const pair = await generateAgentKeyPair();

    const publicKey = decodeBase64Url(pair.publicKey);
    const privateKey = decodeBase64Url(pair.privateKey);

    expect(publicKey?.length).toBe(32);
    // A PKCS#8 Ed25519 key is a 48-byte DER structure.
    expect(privateKey?.length).toBe(48);
  });

  test("produces a keypair that signs and verifies", async () => {
    const pair = await generateAgentKeyPair();
    const privateKey = await importPrivateKey(pair.privateKey);
    const publicKey = await importPublicKey(pair.publicKey);
    const message = new TextEncoder().encode("kitty leash v1");

    const signature = await crypto.subtle.sign("Ed25519", privateKey, message);

    expect(await crypto.subtle.verify("Ed25519", publicKey, signature, message)).toBe(true);
  });

  // Defensive guard: WebCrypto's typings allow `generateKey` to resolve to a
  // bare `CryptoKey`, which would break the exported keypair contract. No
  // runtime does that for Ed25519, so the guard is exercised with a stub.
  test("fails loudly when the runtime does not return a keypair", async () => {
    const subtle = crypto.subtle;
    const generateKey = subtle.generateKey;
    Object.defineProperty(subtle, "generateKey", {
      value: async () => ({ type: "public" }),
      configurable: true,
    });

    try {
      await expect(generateAgentKeyPair()).rejects.toThrow(TypeError);
    } finally {
      Object.defineProperty(subtle, "generateKey", { value: generateKey, configurable: true });
    }
  });
});

describe("key import validation", () => {
  test("throws a TypeError for non-base64url input", async () => {
    await expect(importPublicKey("not base64url!")).rejects.toThrow(TypeError);
    await expect(importPrivateKey("not base64url!")).rejects.toThrow(TypeError);
  });

  test("surfaces WebCrypto errors for invalid key material", async () => {
    await expect(importPublicKey("AA")).rejects.toThrow();
    await expect(importPrivateKey("AA")).rejects.toThrow();
  });
});
