import { zValidator } from "@hono/zod-validator";
import {
  contributionListResponseSchema,
  createKittySchema,
  kittyDetailSchema,
  ledgerPageSchema,
  ledgerQuerySchema,
} from "@kitty/shared/leash-admin";
import { Hono } from "hono";
import type { AdminEnv } from "../../admin/auth";
import { getDb } from "../../lib/db";
import { kittyIdParamSchema } from "../../lib/params";
import { validationHook } from "../../lib/validate";
import * as service from "./kitties.service";

/**
 * Kitty routes (docs/10-api-spec.md §1): `POST /v1/kitties`, its detail and the
 * ledger / contributions feeds. Ownership is enforced in the service.
 */
export const kittiesRoutes = new Hono<AdminEnv>()
  .post("/", zValidator("json", createKittySchema, validationHook), async (c) => {
    const kitty = await service.createKitty(getDb(), c.req.valid("json"), c.get("userId"));

    return c.json(kittyDetailSchema.parse(kitty), 201);
  })
  .get("/:id", zValidator("param", kittyIdParamSchema, validationHook), async (c) => {
    const kitty = await service.getKitty(getDb(), c.req.valid("param").id, c.get("userId"));

    return c.json(kittyDetailSchema.parse(kitty));
  })
  .get(
    "/:id/ledger",
    zValidator("param", kittyIdParamSchema, validationHook),
    zValidator("query", ledgerQuerySchema, validationHook),
    async (c) => {
      const page = await service.listKittyLedger(
        getDb(),
        c.req.valid("param").id,
        c.get("userId"),
        c.req.valid("query"),
      );

      return c.json(ledgerPageSchema.parse(page));
    },
  )
  .get("/:id/contributions", zValidator("param", kittyIdParamSchema, validationHook), async (c) => {
    const list = await service.listKittyContributions(
      getDb(),
      c.req.valid("param").id,
      c.get("userId"),
    );

    return c.json(contributionListResponseSchema.parse(list));
  });
