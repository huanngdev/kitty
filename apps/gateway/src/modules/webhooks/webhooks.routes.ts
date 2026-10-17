import {
  PaypalWebhookEventError,
  parsePaypalWebhookEvent,
  paypalWebhookEventEnvelopeSchema,
  type PaypalWebhookEvent,
  type VerifyWebhookInput,
} from "@kitty/paypal";
import { errorCodes, webhookAckSchema } from "@kitty/shared";
import { Hono } from "hono";
import { env } from "../../env";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { getWebhookVerifier } from "../../lib/paypal";
import { createWebhooksService, type WebhooksService } from "./webhooks.service";
import { createDrizzleWebhooksStore } from "./webhooks.repository";

/**
 * `POST /webhooks/paypal` (docs/10-api-spec.md §5).
 *
 * The order matters: refuse when the webhook is not configured, read the raw
 * body **once** (PayPal signs those exact bytes), verify the signature through
 * PayPal's API, and only then trust the payload. A failed signature is a `400`
 * and logs the event id alone — the body is untrusted (AGENTS.md invariant #10).
 * Everything after that answers `200` fast so PayPal stops retrying.
 */

export interface WebhookRouteDeps {
  /** `PAYPAL_WEBHOOK_ID`; `undefined` makes the endpoint fail closed (503). */
  readonly getWebhookId: () => string | undefined;
  readonly verifySignature: (input: VerifyWebhookInput) => Promise<boolean>;
  readonly service: WebhooksService;
}

/** Reads the event id for a log line without trusting anything else. */
function eventIdOf(payload: unknown): string | undefined {
  const envelope = paypalWebhookEventEnvelopeSchema.safeParse(payload);

  return envelope.success ? envelope.data.id : undefined;
}

export function createWebhooksRoutes(deps: WebhookRouteDeps): Hono {
  return new Hono().post("/paypal", async (c) => {
    const webhookId = deps.getWebhookId();

    if (webhookId === undefined) {
      throw new AppError(errorCodes.webhookNotConfigured, 503, {
        reason: "PAYPAL_WEBHOOK_ID is not configured; refusing to process webhooks",
      });
    }

    const rawBody = await c.req.text();

    let payload: unknown;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new AppError(errorCodes.webhookPayloadInvalid, 400, {
        reason: "webhook body is not JSON",
      });
    }

    const eventId = eventIdOf(payload);
    const verified = await deps.verifySignature({
      headers: c.req.header(),
      rawBody,
      webhookId,
    });

    if (!verified) {
      logger.warn({ eventId }, "rejected PayPal webhook: signature verification failed");

      throw new AppError(errorCodes.webhookSignatureInvalid, 400, { eventId: eventId ?? null });
    }

    let event: PaypalWebhookEvent;

    try {
      event = parsePaypalWebhookEvent(payload);
    } catch (error) {
      if (error instanceof PaypalWebhookEventError) {
        throw new AppError(errorCodes.webhookPayloadInvalid, 400, { eventId: eventId ?? null });
      }

      throw error;
    }

    const result = await deps.service.handleEvent(event);

    return c.json(
      webhookAckSchema.parse({
        ok: true,
        duplicate: result.duplicate,
        status: result.status,
      }),
    );
  });
}

let service: WebhooksService | undefined;

function getWebhooksService(): WebhooksService {
  service ??= createWebhooksService({ store: createDrizzleWebhooksStore(getDb()) });

  return service;
}

/** The store is resolved on first use so `/health` and the Admin API need no DB. */
const lazyService: WebhooksService = {
  handleEvent: (event) => getWebhooksService().handleEvent(event),
};

/** The `/webhooks` API mounted by the gateway app. */
export const webhooksRoutes = createWebhooksRoutes({
  getWebhookId: () => env.PAYPAL_WEBHOOK_ID,
  verifySignature: (input) => getWebhookVerifier().verify(input),
  service: lazyService,
});
