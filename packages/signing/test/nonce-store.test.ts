import { describe, expect, test } from "bun:test";
import { createMemoryNonceStore, NONCE_TTL_MS } from "../src/nonce-store";

const agentId = "agt_01JBXR7Q0J0Q4QTP8W3G8V0S3K";
const start = new Date("2026-11-02T08:00:00.000Z");

describe("createMemoryNonceStore", () => {
  test("claims a nonce once and rejects the replay", async () => {
    const store = createMemoryNonceStore();
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

    expect(await store.claim(agentId, "nonce-1", expiresAt)).toBe(true);
    expect(await store.claim(agentId, "nonce-1", expiresAt)).toBe(false);
    expect(store.size()).toBe(1);
  });

  test("scopes nonces per agent", async () => {
    const store = createMemoryNonceStore({ now: () => start });
    const expiresAt = new Date(start.getTime() + NONCE_TTL_MS);

    expect(await store.claim(agentId, "nonce-1", expiresAt)).toBe(true);
    expect(await store.claim("agt_01JBXR7Q0J0Q4QTP8W3G8V0S3Z", "nonce-1", expiresAt)).toBe(true);
    expect(store.size()).toBe(2);
  });

  test("purges entries once their TTL has passed", async () => {
    let current = start;
    const store = createMemoryNonceStore({ now: () => current });
    const expiresAt = new Date(start.getTime() + NONCE_TTL_MS);
    await store.claim(agentId, "nonce-1", expiresAt);

    current = new Date(expiresAt.getTime() - 1);
    store.purge();
    expect(store.size()).toBe(1);

    current = new Date(expiresAt.getTime());
    store.purge();
    expect(store.size()).toBe(0);

    // The same nonce can be claimed again once it expired.
    expect(await store.claim(agentId, "nonce-1", new Date(current.getTime() + NONCE_TTL_MS))).toBe(
      true,
    );
  });

  test("purges lazily on claim", async () => {
    let current = start;
    const store = createMemoryNonceStore({ now: () => current });
    await store.claim(agentId, "nonce-1", new Date(start.getTime() + NONCE_TTL_MS));

    current = new Date(start.getTime() + NONCE_TTL_MS + 1);
    expect(await store.claim(agentId, "nonce-2", new Date(current.getTime() + NONCE_TTL_MS))).toBe(
      true,
    );
    expect(store.size()).toBe(1);
  });
});
