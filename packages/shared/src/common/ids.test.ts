import { describe, expect, test } from "bun:test";
import { idPrefixes, idSchema } from "./ids";

/** 26-character Crockford base32 body. */
const validUlid = "01JABCDEFGHJKMNPQRSTVWXYZ0";

describe("idSchema", () => {
  test("accepts an id whose prefix and ULID body match", () => {
    const eventId = idSchema(idPrefixes.event);

    expect(eventId.safeParse(`evt_${validUlid}`).success).toBe(true);
    expect(idSchema(idPrefixes.member).safeParse(`mem_${validUlid}`).success).toBe(true);
  });

  test("rejects a wrong prefix, a short body and illegal characters", () => {
    const memberId = idSchema(idPrefixes.member);
    const shortBody = validUlid.slice(0, 25);
    const illegalBody = `${validUlid.slice(0, 25)}O`;

    expect(memberId.safeParse(`evt_${validUlid}`).success).toBe(false);
    expect(memberId.safeParse(`mem_${shortBody}`).success).toBe(false);
    expect(memberId.safeParse(`mem_${illegalBody}`).success).toBe(false);
  });
});
