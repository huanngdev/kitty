import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";

/**
 * Agent-key contracts for the Gateway Admin API (docs/10-api-spec.md §1,
 * docs/05-leash-spec.md §5).
 *
 * The public key is the base64url raw Ed25519 key the agent signs its
 * `leash_*` calls with. The gateway validates it with `@kitty/signing`
 * `importPublicKey` before storing it.
 */

/** The four agent roles of docs/12-agents.md. */
export const agentRoleSchema = z.enum(["planner", "shopper", "collector", "treasurer"]);

export type AgentRole = z.infer<typeof agentRoleSchema>;

export const agentKeyStatusSchema = z.enum(["active", "rotated", "disabled"]);

export type AgentKeyStatus = z.infer<typeof agentKeyStatusSchema>;

/** `POST /v1/agents` body. */
export const registerAgentSchema = z.object({
  agentId: idSchema(idPrefixes.agent),
  kittyId: idSchema(idPrefixes.kitty),
  role: agentRoleSchema,
  /** base64url raw Ed25519 public key. */
  publicKey: z.string().min(1),
});

export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;

export const agentSchema = z.object({
  agentId: idSchema(idPrefixes.agent),
  kittyId: idSchema(idPrefixes.kitty),
  role: agentRoleSchema,
  publicKey: z.string().min(1),
  status: agentKeyStatusSchema,
  createdAt: z.string(),
});

export type Agent = z.infer<typeof agentSchema>;
