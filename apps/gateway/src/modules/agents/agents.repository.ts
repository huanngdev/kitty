import { type AgentKeyRow, type NewAgentKey, agentKeys } from "@kitty/db";
import { eq } from "drizzle-orm";
import type { DbLike } from "../../lib/db-types";

/** Drizzle queries for agent keys (CODE_RULES.md §D). */

export async function insertAgentKey(db: DbLike, row: NewAgentKey): Promise<AgentKeyRow> {
  const [inserted] = await db.insert(agentKeys).values(row).returning();

  if (inserted === undefined) {
    throw new Error("agent key insert returned no row");
  }

  return inserted;
}

export async function findAgentById(db: DbLike, agentId: string): Promise<AgentKeyRow | undefined> {
  const [row] = await db.select().from(agentKeys).where(eq(agentKeys.agentId, agentId)).limit(1);

  return row;
}

/** Locks the agent row so two concurrent leash creates for one agent serialize. */
export async function findAgentByIdForUpdate(
  db: DbLike,
  agentId: string,
): Promise<AgentKeyRow | undefined> {
  const [row] = await db
    .select()
    .from(agentKeys)
    .where(eq(agentKeys.agentId, agentId))
    .limit(1)
    .for("update");

  return row;
}
