import { nonces } from "@kitty/db/schema";
import type { NonceStore } from "@kitty/signing";
import { sql } from "drizzle-orm";
import type { DbLike } from "../../lib/db-types";

/**
 * Postgres replay protection over the existing `leash.nonces` table
 * (docs/05 §5, docs/09 §3). No migration is needed: the table already has
 * `PRIMARY KEY (agent_id, nonce)` and an `expires_at` sweep index (KIT-5 note).
 *
 * The claim is one atomic statement:
 *
 * ```sql
 * INSERT INTO leash.nonces (agent_id, nonce, expires_at) VALUES ($1, $2, $3)
 * ON CONFLICT (agent_id, nonce) DO UPDATE SET expires_at = excluded.expires_at
 *   WHERE leash.nonces.expires_at <= now()
 * RETURNING nonce
 * ```
 *
 * A fresh nonce inserts a row → claimed. An already-seen, still-live nonce hits
 * the primary key and the `WHERE` keeps the row untouched, so nothing is
 * returned → replay. A nonce seen long ago (its TTL passed) is safely
 * re-claimed. Because the claim is a single statement, two concurrent replays
 * cannot both win.
 */
export function createPostgresNonceStore(db: DbLike): NonceStore {
  return {
    async claim(agentId, nonce, expiresAt): Promise<boolean> {
      const claimed = await db
        .insert(nonces)
        .values({ agentId, nonce, expiresAt })
        .onConflictDoUpdate({
          target: [nonces.agentId, nonces.nonce],
          set: { expiresAt },
          setWhere: sql`${nonces.expiresAt} <= now()`,
        })
        .returning({ nonce: nonces.nonce });

      return claimed.length > 0;
    },
  };
}
