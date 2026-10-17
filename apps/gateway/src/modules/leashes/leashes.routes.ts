import { zValidator } from "@hono/zod-validator";
import {
  createLeashSchema,
  intentListResponseSchema,
  leashDetailSchema,
  leashListItemSchema,
  leashListResponseSchema,
  leashTransitionSchema,
  listIntentsQuerySchema,
  topupLeashSchema,
} from "@kitty/shared/leash-admin";
import { Hono } from "hono";
import type { AdminEnv } from "../../admin/auth";
import { getDb } from "../../lib/db";
import { kittyIdParamSchema, leashIdParamSchema } from "../../lib/params";
import { validationHook } from "../../lib/validate";
import * as service from "./leashes.service";

/**
 * Leash routes (docs/10-api-spec.md §1): create/inspect a leash, its lifecycle
 * (`topup`, `pause`, `resume`, `revoke`) and the per-kitty leashes / intents
 * lists.
 */
export const leashesRoutes = new Hono<AdminEnv>()
  .post("/", zValidator("json", createLeashSchema, validationHook), async (c) => {
    const leash = await service.createLeash(getDb(), c.req.valid("json"), c.get("userId"));

    return c.json(leashListItemSchema.parse(leash), 201);
  })
  .get("/:id", zValidator("param", leashIdParamSchema, validationHook), async (c) => {
    const leash = await service.getLeashDetail(getDb(), c.req.valid("param").id, c.get("userId"));

    return c.json(leashDetailSchema.parse(leash));
  })
  .post(
    "/:id/topup",
    zValidator("param", leashIdParamSchema, validationHook),
    zValidator("json", topupLeashSchema, validationHook),
    async (c) => {
      const leash = await service.topupLeash(
        getDb(),
        c.req.valid("param").id,
        c.req.valid("json"),
        c.get("userId"),
      );

      return c.json(leashListItemSchema.parse(leash));
    },
  )
  .post(
    "/:id/pause",
    zValidator("param", leashIdParamSchema, validationHook),
    zValidator("json", leashTransitionSchema, validationHook),
    async (c) => {
      const leash = await service.pauseLeash(
        getDb(),
        c.req.valid("param").id,
        c.req.valid("json").reason,
        c.get("userId"),
      );

      return c.json(leashDetailSchema.parse(leash));
    },
  )
  .post(
    "/:id/resume",
    zValidator("param", leashIdParamSchema, validationHook),
    zValidator("json", leashTransitionSchema, validationHook),
    async (c) => {
      const leash = await service.resumeLeash(
        getDb(),
        c.req.valid("param").id,
        c.req.valid("json").reason,
        c.get("userId"),
      );

      return c.json(leashDetailSchema.parse(leash));
    },
  )
  .post(
    "/:id/revoke",
    zValidator("param", leashIdParamSchema, validationHook),
    zValidator("json", leashTransitionSchema, validationHook),
    async (c) => {
      const leash = await service.revokeLeash(
        getDb(),
        c.req.valid("param").id,
        c.req.valid("json").reason,
        c.get("userId"),
      );

      return c.json(leashDetailSchema.parse(leash));
    },
  );

/** Leash / intent listings that hang off a kitty (docs/10-api-spec.md §1). */
export const kittyLeashesRoutes = new Hono<AdminEnv>()
  .get("/:id/leashes", zValidator("param", kittyIdParamSchema, validationHook), async (c) => {
    const list = await service.listKittyLeashes(getDb(), c.req.valid("param").id, c.get("userId"));

    return c.json(leashListResponseSchema.parse(list));
  })
  .get(
    "/:id/intents",
    zValidator("param", kittyIdParamSchema, validationHook),
    zValidator("query", listIntentsQuerySchema, validationHook),
    async (c) => {
      const list = await service.listKittyIntents(
        getDb(),
        c.req.valid("param").id,
        c.get("userId"),
        c.req.valid("query"),
      );

      return c.json(intentListResponseSchema.parse(list));
    },
  );
