import { agentKeys } from "@kitty/db/schema";
import type { ResolvePublicKey } from "@kitty/signing";
import { and, eq } from "drizzle-orm";
import type { DbLike } from "../../lib/db-types";

/**
 * Resolves an agent's Ed25519 public key from `leash.agent_keys`
 * (docs/05 §5, docs/09 §3).
 *
 * Only the `active` key of an agent can verify a request; a rotated or disabled
 * key is treated as unknown, so the caller fails closed with `UNKNOWN_AGENT`.
 * The base64url raw public key is returned as stored; `@kitty/signing` imports
 * it and returns `BAD_SIGNATURE` when the bytes are not a usable key.
 */
export function createResolvePublicKey(db: DbLike): ResolvePublicKey {
  return async (agentId): Promise<string | null> => {
    const [row] = await db
      .select({ publicKey: agentKeys.publicKey })
      .from(agentKeys)
      .where(and(eq(agentKeys.agentId, agentId), eq(agentKeys.status, "active")))
      .limit(1);

    return row?.publicKey ?? null;
  };
}
