/** SHA-256 over the raw request body, hex encoded (WebCrypto only). */

/** Returns the lowercase hex SHA-256 digest of `bytes`. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}
