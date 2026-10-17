import { reconcileSweepRequestSchema, reconcileSweepResponseSchema } from "@kitty/shared";
import { zValidator } from "@hono/zod-validator";
import { type MiddlewareHandler, Hono } from "hono";
import { getDb } from "../../lib/db";
import { getPayoutStatusReader } from "../../lib/paypal";
import { validationHook } from "../../lib/validate";
import { internalAuth } from "../intents/internal-auth";
import { createReconcileService, type ReconcileService } from "./reconcile.service";
import { createDrizzleWebhooksStore } from "./webhooks.repository";

/**
 * `POST /internal/sweeps/reconcile` (docs/10-api-spec.md §6, docs/11 §4).
 *
 * The worker calls this to settle payouts whose webhook never arrived. It is
 * behind the same `GATEWAY_INTERNAL_TOKEN` as the rest of `/internal`, and
 * parses its body with the shared contract so the request shape is documented
 * in one place.
 */

export interface ReconcileRouteDeps {
  readonly service: ReconcileService;
}

export function createReconcileRoutes(auth: MiddlewareHandler, deps: ReconcileRouteDeps): Hono {
  return new Hono()
    .use("*", auth)
    .post(
      "/sweeps/reconcile",
      zValidator("json", reconcileSweepRequestSchema, validationHook),
      async (c) => {
        const result = await deps.service.reconcile(c.req.valid("json"));

        return c.json(reconcileSweepResponseSchema.parse(result));
      },
    );
}

let service: ReconcileService | undefined;

function getReconcileService(): ReconcileService {
  service ??= createReconcileService({
    store: createDrizzleWebhooksStore(getDb()),
    payouts: getPayoutStatusReader(),
    now: () => new Date(),
  });

  return service;
}

const lazyService: ReconcileService = {
  reconcile: (input) => getReconcileService().reconcile(input),
};

/** The `/internal/sweeps` API mounted by the gateway app. */
export const reconcileRoutes = createReconcileRoutes(internalAuth, { service: lazyService });
