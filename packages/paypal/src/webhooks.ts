import type { PayPalTransport } from "./http";
import { verifyWebhookRequestSchema, verifyWebhookResponseSchema, webhookSchema } from "./schemas";
import type {
  VerifyWebhookInput,
  WebhookIdInput,
  WebhookInfo,
  WebhookTransmissionHeaders,
  WebhooksNamespace,
} from "./types";

/** Canonical (lowercase) names of the five signed transmission headers. */
export const WEBHOOK_TRANSMISSION_HEADERS = {
  transmissionId: "paypal-transmission-id",
  transmissionTime: "paypal-transmission-time",
  certUrl: "paypal-cert-url",
  authAlgo: "paypal-auth-algo",
  transmissionSig: "paypal-transmission-sig",
} as const satisfies Record<keyof WebhookTransmissionHeaders, string>;

/**
 * Picks the five `PAYPAL-TRANSMISSION-*` headers case-insensitively.
 * Missing headers come back as `""`; the verify request then fails closed.
 */
export function pickWebhookHeaders(
  headers: Readonly<Record<string, string | undefined>>,
): WebhookTransmissionHeaders {
  const lowered = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      lowered.set(key.toLowerCase(), value);
    }
  }

  const read = (name: string): string => lowered.get(name) ?? "";

  return {
    transmissionId: read(WEBHOOK_TRANSMISSION_HEADERS.transmissionId),
    transmissionTime: read(WEBHOOK_TRANSMISSION_HEADERS.transmissionTime),
    certUrl: read(WEBHOOK_TRANSMISSION_HEADERS.certUrl),
    authAlgo: read(WEBHOOK_TRANSMISSION_HEADERS.authAlgo),
    transmissionSig: read(WEBHOOK_TRANSMISSION_HEADERS.transmissionSig),
  };
}

/** Notifications v1 webhook verification and lookup (docs/11 §3). */
export function createWebhooksNamespace(transport: PayPalTransport): WebhooksNamespace {
  return {
    async verifySignature(input: VerifyWebhookInput): Promise<boolean> {
      const transmission = pickWebhookHeaders(input.headers);
      // Parse the raw body exactly once; PayPal signs the raw bytes, so the
      // event we forward is the parsed form of that same body.
      const event: unknown = JSON.parse(input.rawBody);
      const body = verifyWebhookRequestSchema.parse({
        transmission_id: transmission.transmissionId,
        transmission_time: transmission.transmissionTime,
        cert_url: transmission.certUrl,
        auth_algo: transmission.authAlgo,
        transmission_sig: transmission.transmissionSig,
        webhook_id: input.webhookId,
        webhook_event: event,
      });

      return transport.request<boolean>({
        method: "POST",
        path: "/v1/notifications/verify-webhook-signature",
        body,
        parse: (data): boolean =>
          verifyWebhookResponseSchema.parse(data).verification_status === "SUCCESS",
      });
    },

    async getWebhook(input: WebhookIdInput): Promise<WebhookInfo> {
      return transport.request<WebhookInfo>({
        method: "GET",
        path: `/v1/notifications/webhooks/${encodeURIComponent(input.webhookId)}`,
        parse: (data): WebhookInfo => {
          const webhook = webhookSchema.parse(data);

          return {
            id: webhook.id,
            url: webhook.url,
            eventTypes: (webhook.event_types ?? []).flatMap((event) =>
              event.name !== undefined ? [event.name] : [],
            ),
          };
        },
      });
    },
  };
}
