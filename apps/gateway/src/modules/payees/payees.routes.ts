import { zValidator } from "@hono/zod-validator";
import {
  payeeListResponseSchema,
  removePayeeResponseSchema,
  verifyPayeeSchema,
  verifiedPayeeSchema,
} from "@kitty/shared/leash-admin";
import { Hono } from "hono";
import type { AdminEnv } from "../../admin/auth";
import { getDb } from "../../lib/db";
import { kittyIdParamSchema, payeeParamSchema } from "../../lib/params";
import { validationHook } from "../../lib/validate";
import * as service from "./payees.service";

/**
 * Verified-payee routes (AGENTS.md invariant #12, docs/10-api-spec.md §1).
 *
 * The organizer verifies a vendor email before a leash can name it. `member:*`
 * is the only token exempt from verification and is handled by leash create.
 */
export const payeesRoutes = new Hono<AdminEnv>()
  .post(
    "/:id/payees",
    zValidator("param", kittyIdParamSchema, validationHook),
    zValidator("json", verifyPayeeSchema, validationHook),
    async (c) => {
      const payee = await service.verifyPayee(
        getDb(),
        c.req.valid("param").id,
        c.req.valid("json").email,
        c.get("userId"),
      );

      return c.json(verifiedPayeeSchema.parse(payee), 201);
    },
  )
  .get("/:id/payees", zValidator("param", kittyIdParamSchema, validationHook), async (c) => {
    const list = await service.listPayees(getDb(), c.req.valid("param").id, c.get("userId"));

    return c.json(payeeListResponseSchema.parse(list));
  })
  .delete(
    "/:id/payees/:email",
    zValidator("param", payeeParamSchema, validationHook),
    async (c) => {
      const result = await service.removePayee(
        getDb(),
        c.req.valid("param").id,
        c.req.valid("param").email,
        c.get("userId"),
      );

      return c.json(removePayeeResponseSchema.parse(result));
    },
  );
