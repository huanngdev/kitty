import { zValidator } from "@hono/zod-validator";
import {
  createVendorSchema,
  updateVendorSchema,
  vendorDetailResponseSchema,
  vendorListResponseSchema,
} from "@kitty/shared/vendors";
import { Hono } from "hono";
import { eventIdParamSchema, vendorIdParamSchema } from "../../lib/params";
import { validationHook } from "../../lib/validate";
import { type AppEnv, requireUser } from "../../middleware/session";
import { type VendorsService, getVendorsService } from "./vendors.service";

/**
 * Vendor routes (docs/10-api-spec.md §4, AGENTS.md invariant #12), mounted under
 * `/api/events`:
 *
 * - `POST   /api/events/:id/vendors`              create (always `verified=false`)
 * - `GET    /api/events/:id/vendors`
 * - `PATCH  /api/events/:id/vendors/:vendorId`
 * - `POST   /api/events/:id/vendors/:vendorId/verify`  organizer-only, also
 *   registers the PayPal email as a gateway verified payee.
 *
 * `getService` is injected for route tests; the app uses {@link getVendorsService}.
 */
export function createVendorsRoutes(getService: () => VendorsService): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .post(
      "/:id/vendors",
      zValidator("param", eventIdParamSchema, validationHook),
      zValidator("json", createVendorSchema, validationHook),
      async (c) => {
        const user = requireUser(c);
        const vendor = await getService().create(
          c.req.valid("param").id,
          c.req.valid("json"),
          user.id,
        );

        return c.json(vendorDetailResponseSchema.parse(vendor), 201);
      },
    )
    .get("/:id/vendors", zValidator("param", eventIdParamSchema, validationHook), async (c) => {
      const user = requireUser(c);
      const items = await getService().list(c.req.valid("param").id, user.id);

      return c.json(vendorListResponseSchema.parse({ items }));
    })
    .patch(
      "/:id/vendors/:vendorId",
      zValidator("param", vendorIdParamSchema, validationHook),
      zValidator("json", updateVendorSchema, validationHook),
      async (c) => {
        const user = requireUser(c);
        const vendor = await getService().update(
          c.req.valid("param").id,
          c.req.valid("param").vendorId,
          c.req.valid("json"),
          user.id,
        );

        return c.json(vendorDetailResponseSchema.parse(vendor));
      },
    )
    .post(
      "/:id/vendors/:vendorId/verify",
      zValidator("param", vendorIdParamSchema, validationHook),
      async (c) => {
        const user = requireUser(c);
        const vendor = await getService().verify(
          c.req.valid("param").id,
          c.req.valid("param").vendorId,
          user.id,
        );

        return c.json(vendorDetailResponseSchema.parse(vendor));
      },
    );
}

/** The app-mounted router, wired to the singleton service. */
export const vendorsRoutes = createVendorsRoutes(getVendorsService);
