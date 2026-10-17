import { zValidator } from "@hono/zod-validator";
import { agentResponseSchema, registerAgentSchema } from "@kitty/shared/leash-admin";
import { Hono } from "hono";
import type { AdminEnv } from "../../admin/auth";
import { getDb } from "../../lib/db";
import { validationHook } from "../../lib/validate";
import * as service from "./agents.service";

/**
 * Agent routes (docs/10-api-spec.md §1): `POST /v1/agents` registers an
 * Ed25519 public key for one agent of a kitty.
 */
export const agentsRoutes = new Hono<AdminEnv>().post(
  "/",
  zValidator("json", registerAgentSchema, validationHook),
  async (c) => {
    const agent = await service.registerAgent(getDb(), c.req.valid("json"), c.get("userId"));

    return c.json(agentResponseSchema.parse(agent), 201);
  },
);
