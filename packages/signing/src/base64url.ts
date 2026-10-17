/**
 * Unpadded base64url (RFC 4648 §5) helpers.
 *
 * Implemented by hand on top of plain `Uint8Array` so the package stays pure
 * TypeScript: no `Buffer`, no Node-only API, identical behaviour on Bun, Node
 * and browsers. Decoding is strict — any malformed or non-canonical input
 * returns `null` instead of silently truncating, because the gateway maps that
 * to a `MALFORMED_HEADERS` rejection (docs/05 §5).
 */

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const digitValues: Record<string, number> = {};
for (const [index, character] of [...alphabet].entries()) {
  digitValues[character] = index;
}

function symbolOf(index: number): string {
  return alphabet[index & 0x3f] ?? "";
}

/** Encodes bytes as unpadded base64url. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const remaining = bytes.length - index;
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;

    encoded += symbolOf(chunk >> 18);
    encoded += symbolOf(chunk >> 12);
    if (remaining > 1) {
      encoded += symbolOf(chunk >> 6);
    }
    if (remaining > 2) {
      encoded += symbolOf(chunk);
    }
  }

  return encoded;
}

/**
 * Decodes unpadded base64url.
 *
 * Returns `null` when the input is empty, has an impossible length, contains a
 * character outside the base64url alphabet, or carries non-zero padding bits
 * (non-canonical encoding).
 */
export function decodeBase64Url(value: string): Uint8Array | null {
  if (value.length === 0 || value.length % 4 === 1) {
    return null;
  }

  let bitBuffer = 0;
  let bitCount = 0;
  const decoded: number[] = [];

  for (const character of value) {
    const digit = digitValues[character];
    if (digit === undefined) {
      return null;
    }

    bitBuffer = (bitBuffer << 6) | digit;
    bitCount += 6;

    if (bitCount >= 8) {
      bitCount -= 8;
      decoded.push((bitBuffer >> bitCount) & 0xff);
    }
  }

  if ((bitBuffer & ((1 << bitCount) - 1)) !== 0) {
    return null;
  }

  return Uint8Array.from(decoded);
}
