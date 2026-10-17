import { z } from "zod";

/**
 * Wire contract of the Gateway Webhook (`POST /webhooks/paypal`,
 * docs/10-api-spec.md §5).
 *
 * PayPal is the only caller. The endpoint always answers `200` for a verified
 * delivery — including a duplicate and an event Kitty ignores — so PayPal stops
 * retrying; only a failed signature (`400`) or a missing `PAYPAL_WEBHOOK_ID`
 * configuration (`503`) is an error.
 */

/** How far the gateway got with one stored webhook event (docs/09 §3.3). */
export const webhookEventStatusSchema = z.enum([
  /** Stored but not dispatched yet (only inside the handler transaction). */
  "received",
  /** A handler applied every state change this event asked for. */
  "processed",
  /** Verified and stored, but nothing to do (unknown type, or a no-op transition). */
  "ignored",
  /** In scope, but it could not be applied (unknown intent, malformed resource). */
  "failed",
]);

export type WebhookEventStatusDto = z.infer<typeof webhookEventStatusSchema>;

/** Response of `POST /webhooks/paypal`. */
export const webhookAckSchema = z.object({
  ok: z.literal(true),
  /** True when this event id had already been delivered and stored. */
  duplicate: z.boolean(),
  /** What the handler did with the event (`processed` | `ignored` | `failed`). */
  status: webhookEventStatusSchema,
});

export type WebhookAck = z.infer<typeof webhookAckSchema>;
