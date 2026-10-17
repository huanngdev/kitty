import type { AgentKeyRow, Db } from "@kitty/db";
import { errorCodes } from "@kitty/shared";
import {
  type Agent,
  type AgentKeyStatus,
  type AgentRole,
  type RegisterAgentInput,
  agentKeyStatusSchema,
  agentRoleSchema,
} from "@kitty/shared/leash-admin";
import { importPublicKey } from "@kitty/signing";
import { AppError } from "../../lib/errors";
import { narrowEnum } from "../../lib/narrow";
import { requireOwnedKitty } from "../../lib/ownership";
import * as kittiesRepo from "../kitties/kitties.repository";
import * as repo from "./agents.repository";

/**
 * Agent-key service (docs/10-api-spec.md §1, docs/05-leash-spec.md §5).
 *
 * Registering an agent stores only its Ed25519 **public** key — the gateway
 * never sees a private key or any PayPal credential (AGENTS.md invariant #3).
 */

export function toAgent(row: AgentKeyRow): Agent {
  return {
    agentId: row.agentId,
    kittyId: row.kittyId,
    role: narrowEnum<AgentRole>(row.role, agentRoleSchema.options, "agent.role"),
    publicKey: row.publicKey,
    status: narrowEnum<AgentKeyStatus>(row.status, agentKeyStatusSchema.options, "agent.status"),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Validates the base64url raw Ed25519 key with `@kitty/signing`. */
async function assertValidPublicKey(publicKey: string): Promise<void> {
  try {
    await importPublicKey(publicKey);
  } catch {
    throw new AppError(errorCodes.invalidPublicKey, 400, { reason: "not_an_ed25519_public_key" });
  }
}

export async function registerAgent(
  db: Db,
  input: RegisterAgentInput,
  actorUserId: string,
): Promise<Agent> {
  requireOwnedKitty(await kittiesRepo.findKittyById(db, input.kittyId), actorUserId);

  await assertValidPublicKey(input.publicKey);

  const existing = await repo.findAgentById(db, input.agentId);

  if (existing !== undefined) {
    throw new AppError(errorCodes.conflict, 409, { agentId: input.agentId });
  }

  const row = await repo.insertAgentKey(db, {
    agentId: input.agentId,
    kittyId: input.kittyId,
    role: input.role,
    publicKey: input.publicKey,
    status: "active",
  });

  return toAgent(row);
}
