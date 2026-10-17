/**
 * Agent Ed25519 keypairs (docs/05 §5).
 *
 * Wire formats:
 * - public key: base64url of the **raw** 32-byte Ed25519 public key.
 * - private key: base64url of the **PKCS#8** DER export. The gateway never sees
 *   it; it lives in the agent runtime secret store only (AGENTS.md §3 #3).
 *
 * WebCrypto only (`crypto.subtle`), so no `Buffer` and no Node-only API.
 */

import { decodeBase64Url, encodeBase64Url } from "./base64url";

/** The only signing algorithm Kitty agents use. */
export const AGENT_KEY_ALGORITHM = "Ed25519";

export interface AgentKeyPair {
  /** base64url raw Ed25519 public key. */
  publicKey: string;
  /** base64url PKCS#8 Ed25519 private key. */
  privateKey: string;
}

/** Generates an extractable Ed25519 keypair in the wire formats above. */
export async function generateAgentKeyPair(): Promise<AgentKeyPair> {
  const generated = await crypto.subtle.generateKey(AGENT_KEY_ALGORITHM, true, ["sign", "verify"]);
  if (!("privateKey" in generated)) {
    throw new TypeError("Ed25519 generateKey did not return a keypair");
  }

  const publicKeyBytes = await crypto.subtle.exportKey("raw", generated.publicKey);
  const privateKeyBytes = await crypto.subtle.exportKey("pkcs8", generated.privateKey);

  return {
    publicKey: encodeBase64Url(new Uint8Array(publicKeyBytes)),
    privateKey: encodeBase64Url(new Uint8Array(privateKeyBytes)),
  };
}

/**
 * Imports a base64url raw public key for verification.
 *
 * Throws a `TypeError` when the value is not base64url, and lets WebCrypto throw
 * for bytes that are not a valid Ed25519 public key.
 */
export async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  const bytes = decodeBase64Url(publicKey);
  if (bytes === null) {
    throw new TypeError("public key is not valid base64url");
  }

  return crypto.subtle.importKey("raw", bytes, AGENT_KEY_ALGORITHM, true, ["verify"]);
}

/**
 * Imports a base64url PKCS#8 private key for signing.
 *
 * Throws a `TypeError` when the value is not base64url, and lets WebCrypto throw
 * for bytes that are not a valid Ed25519 private key.
 */
export async function importPrivateKey(privateKey: string): Promise<CryptoKey> {
  const bytes = decodeBase64Url(privateKey);
  if (bytes === null) {
    throw new TypeError("private key is not valid base64url");
  }

  return crypto.subtle.importKey("pkcs8", bytes, AGENT_KEY_ALGORITHM, true, ["sign"]);
}
