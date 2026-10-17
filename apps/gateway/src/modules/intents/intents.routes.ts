import { zValidator } from "@hono/zod-validator";
import {
  executeIntentResponseSchema,
  getIntentResponseSchema,
  idPrefixes,
  idSchema,
} from "@kitty/shared";
import { type MiddlewareHandler, Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { getPayoutExecutor, type PayoutExecutor } from "../../lib/paypal";
import { validationHook } from "../../lib/validate";
import { createIntentsService, type IntentsService } from "./intents.service";
import { internalAuth } from "./internal-auth";
import { createDrizzleIntentsStore } from "./intents.repository";

/**
 * Gateway Internal API (`/internal`, docs/10 §6) used by the worker to execute
 * an approved intent and to read one back. `auth` is passed in so tests can
 * inject a token without a real environment; the app mounts the env-backed
 * {@link internalAuth}.
 */

let service: IntentsService | undefined;

/**
 * Resolves PayPal lazily so reads (GET /internal/intents/:id) never require
 * PayPal credentials; only an actual payout does (AGENTS.md invariant #1).
 */
const lazyPayouts: PayoutExecutor = {
  createPayout: (input) => getPayoutExecutor().createPayout(input),
};

function getIntentsService(): IntentsService {
  service ??= createIntentsService({
    store: createDrizzleIntentsStore(getDb()),
    payouts: lazyPayouts,
    now: () => new Date(),
  });

  return service;
}

const intentIdParamSchema = z.object({ id: idSchema(idPrefixes.spendIntent) });

export function createIntentsRoutes(auth: MiddlewareHandler): Hono {
  return new Hono()
    .use("*", auth)
    .post(
      "/intents/:id/execute",
      zValidator("param", intentIdParamSchema, validationHook),
      async (c) => {
        const { id } = c.req.valid("param");
        const result = await getIntentsService().executeIntent(id);
        const intent = await getIntentsService().getIntent(result.intentId);

        if (intent === null) {
          throw new AppError("INTENT_NOT_FOUND", 404, { intentId: result.intentId });
        }

        return c.json(executeIntentResponseSchema.parse({ intent, outcome: result.outcome }));
      },
    )
    .get("/intents/:id", zValidator("param", intentIdParamSchema, validationHook), async (c) => {
      const { id } = c.req.valid("param");
      const intent = await getIntentsService().getIntent(id);

      if (intent === null) {
        throw new AppError("INTENT_NOT_FOUND", 404, { intentId: id });
      }

      return c.json(getIntentResponseSchema.parse({ intent }));
    });
}

/** The `/internal` API mounted by the gateway app. */
export const intentsRoutes = createIntentsRoutes(internalAuth);
