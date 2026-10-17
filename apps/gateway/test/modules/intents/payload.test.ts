import { describe, expect, test } from "bun:test";
import { payloadHash } from "../../../src/modules/intents/payload";
import { spendIntent } from "../../support/intents/fixtures";

describe("payloadHash", () => {
  test("is a stable sha256 hex digest", async () => {
    const hash = await payloadHash(spendIntent({ intentId: "int_fixed" }));

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await payloadHash(spendIntent({ intentId: "int_fixed" }))).toBe(hash);
  });

  test("ignores the intent id and the justification", async () => {
    const base = spendIntent({ intentId: "int_a", justification: "one" });

    expect(await payloadHash({ ...base, intentId: "int_b" })).toBe(await payloadHash(base));
    expect(await payloadHash({ ...base, justification: "two" })).toBe(await payloadHash(base));
  });

  test("changes when any decision field changes", async () => {
    const base = await payloadHash(spendIntent());

    expect(await payloadHash(spendIntent({ amountCents: 1_001n }))).not.toBe(base);
    expect(await payloadHash(spendIntent({ action: "refund" }))).not.toBe(base);
    expect(await payloadHash(spendIntent({ currency: "EUR" }))).not.toBe(base);
    expect(await payloadHash(spendIntent({ payee: "other@example.com" }))).not.toBe(base);
    expect(await payloadHash(spendIntent({ category: "food" }))).not.toBe(base);
    expect(await payloadHash(spendIntent({ memo: "different" }))).not.toBe(base);
    expect(await payloadHash(spendIntent({ taskId: "tsk_1" }))).not.toBe(base);
  });

  test("distinguishes an absent optional field from an empty one", async () => {
    const absent = spendIntent({ payee: undefined });
    const empty = spendIntent({ payee: "" });

    expect(await payloadHash(absent)).not.toBe(await payloadHash(empty));
  });
});
