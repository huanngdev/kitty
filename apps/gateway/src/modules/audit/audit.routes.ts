import { zValidator } from "@hono/zod-validator";
import { auditPageSchema, auditQuerySchema } from "@kitty/shared/leash-admin";
import { Hono } from "hono";
import type { AdminEnv } from "../../admin/auth";
import { getDb } from "../../lib/db";
import { kittyIdParamSchema } from "../../lib/params";
import { validationHook } from "../../lib/validate";
import * as service from "./audit.service";

/**
 * Audit feed (docs/10-api-spec.md §1): `GET /v1/kitties/:id/audit` is a
 * cursor-paginated, newest-first view of the append-only audit log.
 */
export const auditRoutes = new Hono<AdminEnv>().get(
  "/:id/audit",
  zValidator("param", kittyIdParamSchema, validationHook),
  zValidator("query", auditQuerySchema, validationHook),
  async (c) => {
    const feed = await service.listKittyAudit(
      getDb(),
      c.req.valid("param").id,
      c.get("userId"),
      c.req.valid("query"),
    );

    return c.json(auditPageSchema.parse(feed));
  },
);
