/**
 * In-memory `NonceStore` used by tests and local dev.
 *
 * The real gateway implementation is a Postgres table with
 * `PRIMARY KEY (agent_id, nonce)` (docs/09) — this one keeps the same contract
 * so callers can be tested without a database. Entries are purged lazily on
 * every claim, using the injected clock (defaults to the system clock).
 */

/** Replay window for `Leash-Nonce` (docs/05 §5: nonces are unique for 10 minutes). */
export const NONCE_TTL_MS = 10 * 60 * 1000;

/**
 * Replay protection contract. Injected by the gateway; a claim must be atomic
 * (`INSERT … ON CONFLICT DO NOTHING` in Postgres).
 */
export interface NonceStore {
  /**
   * Claims a nonce for an agent.
   *
   * Returns `true` when the nonce was unseen (store it until `expiresAt`), and
   * `false` when it was already claimed and has not expired — a replay.
   */
  claim(agentId: string, nonce: string, expiresAt: Date): Promise<boolean>;
}

export interface MemoryNonceStoreOptions {
  /** Clock used for TTL purging; defaults to `() => new Date()`. */
  now?: () => Date;
}

export interface MemoryNonceStore extends NonceStore {
  /** Number of live (unexpired) nonces currently stored. */
  size(): number;
  /** Drops every entry whose TTL has passed at the injected clock's current time. */
  purge(): void;
}

/** Creates a TTL-aware in-memory nonce store. */
export function createMemoryNonceStore(options: MemoryNonceStoreOptions = {}): MemoryNonceStore {
  const now = options.now ?? ((): Date => new Date());
  const entries = new Map<string, number>();

  const purge = (): void => {
    const currentTime = now().getTime();
    for (const [key, expiresAt] of entries) {
      if (expiresAt <= currentTime) {
        entries.delete(key);
      }
    }
  };

  return {
    size(): number {
      return entries.size;
    },
    purge,
    async claim(agentId: string, nonce: string, expiresAt: Date): Promise<boolean> {
      purge();

      const key = `${agentId}\u0000${nonce}`;
      if (entries.has(key)) {
        return false;
      }

      entries.set(key, expiresAt.getTime());
      return true;
    },
  };
}
