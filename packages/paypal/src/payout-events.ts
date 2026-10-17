import { parseMoney } from "@kitty/ledger";
import { z } from "zod";
import { payoutItemAmountSchema, payoutItemCurrency } from "./schemas";

/**
 * Normalisation of the PayPal webhook notifications Kitty consumes
 * (docs/11-paypal-integration.md §3).
 *
 * PayPal signs the **raw** body, so signature verification happens in the
 * gateway before anything here runs (`createWebhooksNamespace`). This module
 * turns an already-verified payload into a small discriminated union: the
 * gateway never switches on PayPal's raw field names, and no PayPal money
 * string reaches the money path (amounts become bigint cents here).
 *
 * Only the payout events are modelled in detail (KIT-7); invoice, order and
 * refund events fall into `other` and get their own handlers in
 * KIT-22/KIT-27/KIT-42.
 */

/** `PAYMENT.PAYOUTS-ITEM.*` — one payout item, looked up by `sender_item_id`. */
export const PAYOUT_ITEM_EVENT_TYPES = [
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
  "PAYMENT.PAYOUTS-ITEM.FAILED",
  "PAYMENT.PAYOUTS-ITEM.RETURNED",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED",
  "PAYMENT.PAYOUTS-ITEM.DENIED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
  "PAYMENT.PAYOUTS-ITEM.ONHOLD",
  "PAYMENT.PAYOUTS-ITEM.REFUNDED",
] as const;

export type PayoutItemEventType = (typeof PAYOUT_ITEM_EVENT_TYPES)[number];

/** `PAYMENT.PAYOUTSBATCH.*` — one payout batch, looked up by `sender_batch_id`. */
export const PAYOUT_BATCH_EVENT_TYPES = [
  "PAYMENT.PAYOUTSBATCH.SUCCESS",
  "PAYMENT.PAYOUTSBATCH.DENIED",
] as const;

export type PayoutBatchEventType = (typeof PAYOUT_BATCH_EVENT_TYPES)[number];

/**
 * The envelope every PayPal webhook shares. `resource` is deliberately
 * `unknown` here: it is modelled per `resource_type` below.
 */
export const paypalWebhookEventEnvelopeSchema = z.object({
  /** PayPal event id: the dedupe key (`leash.webhook_events.id`). */
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource_type: z.string().optional(),
  resource: z.unknown().optional(),
  create_time: z.string().optional(),
});

export type PaypalWebhookEventEnvelope = z.infer<typeof paypalWebhookEventEnvelopeSchema>;

/**
 * `resource` of a `PAYMENT.PAYOUTS-ITEM.*` event.
 *
 * `receiver` and `payout_item_fee` are deliberately **not** modelled: the
 * receiver is the payee email Kitty already stores, and PayPal's fee is not
 * part of the kitty ledger. Zod strips them, so the normalised event carries no
 * PII (AGENTS.md invariant #11).
 *
 * PayPal sends the item lookup key `sender_item_id` and the amount either at
 * the resource's top level or inside the nested `payout_item` model, depending
 * on the event; both are accepted.
 */
export const payoutItemEventResourceSchema = z.object({
  payout_item_id: z.string().min(1),
  transaction_status: z.string().min(1),
  payout_batch_id: z.string().optional(),
  sender_item_id: z.string().optional(),
  transaction_id: z.string().optional(),
  amount: payoutItemAmountSchema.optional(),
  payout_item: z
    .object({
      amount: payoutItemAmountSchema.optional(),
      sender_item_id: z.string().optional(),
    })
    .optional(),
});

/** `resource` of a `PAYMENT.PAYOUTSBATCH.*` event. */
export const payoutBatchEventResourceSchema = z.object({
  payout_batch_id: z.string().min(1),
  batch_status: z.string().min(1),
  sender_batch_header: z.object({ sender_batch_id: z.string().optional() }).optional(),
  time_created: z.string().optional(),
  time_completed: z.string().optional(),
});

/** A verified `PAYMENT.PAYOUTS-ITEM.*` event. */
export interface PayoutItemWebhookEvent {
  readonly kind: "payout_item";
  readonly eventId: string;
  readonly eventType: string;
  /** `resource.payout_item_id`. */
  readonly itemId: string;
  /** `resource.transaction_status`, for example `SUCCESS` or `RETURNED`. */
  readonly itemStatus: string;
  /** `resource.sender_item_id` — the intent id Kitty sent (docs/11 §3). */
  readonly senderItemId?: string;
  readonly batchId?: string;
  readonly transactionId?: string;
  readonly amountCents?: bigint;
  readonly currency?: string;
  readonly createdAt?: string;
  /** The event exactly as verified, stored on `leash.webhook_events.payload`. */
  readonly raw: unknown;
}

/** A verified `PAYMENT.PAYOUTSBATCH.*` event. */
export interface PayoutBatchWebhookEvent {
  readonly kind: "payout_batch";
  readonly eventId: string;
  readonly eventType: string;
  /** `resource.payout_batch_id`. */
  readonly batchId: string;
  /** `resource.batch_status`, for example `SUCCESS` or `DENIED`. */
  readonly batchStatus: string;
  readonly senderBatchId?: string;
  readonly createdAt?: string;
  readonly raw: unknown;
}

/** A verified event no handler consumes yet (invoice, order, refund, …). */
export interface OtherPaypalWebhookEvent {
  readonly kind: "other";
  readonly eventId: string;
  readonly eventType: string;
  /** Best-effort resource id for the `webhook_events.resource_id` column. */
  readonly resourceId?: string;
  readonly raw: unknown;
}

/**
 * A verified payout event whose `resource` does not match the documented
 * shape. It is stored and flagged instead of being dropped, so a PayPal schema
 * change is visible in the admin API rather than silently lost.
 */
export interface MalformedPaypalWebhookEvent {
  readonly kind: "malformed";
  readonly eventId: string;
  readonly eventType: string;
  readonly resourceId?: string;
  readonly raw: unknown;
}

export type PaypalWebhookEvent =
  | PayoutItemWebhookEvent
  | PayoutBatchWebhookEvent
  | OtherPaypalWebhookEvent
  | MalformedPaypalWebhookEvent;

/** Thrown when a verified payload has no usable event id / event type. */
export class PaypalWebhookEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaypalWebhookEventError";
  }
}

/**
 * Best-effort id of the object a PayPal event is about, for the
 * `webhook_events.resource_id` column. Never throws.
 */
function resourceIdOf(resourceType: string | undefined, resource: unknown): string | undefined {
  if (typeof resource !== "object" || resource === null) {
    return undefined;
  }

  const record: Record<string, unknown> = { ...resource };
  const candidates: readonly string[] =
    resourceType === "payouts_item"
      ? ["payout_item_id"]
      : resourceType === "payouts_batch"
        ? ["payout_batch_id"]
        : ["id", "payout_item_id", "payout_batch_id", "invoice_id", "capture_id", "order_id"];

  for (const key of candidates) {
    const value = record[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function isPayoutItemEventType(eventType: string): eventType is PayoutItemEventType {
  return (PAYOUT_ITEM_EVENT_TYPES as readonly string[]).includes(eventType);
}

function isPayoutBatchEventType(eventType: string): eventType is PayoutBatchEventType {
  return (PAYOUT_BATCH_EVENT_TYPES as readonly string[]).includes(eventType);
}

/**
 * Parses a **verified** PayPal webhook payload into {@link PaypalWebhookEvent}.
 *
 * Throws {@link PaypalWebhookEventError} only when the envelope itself is
 * unusable (no event id or event type) — nothing can be deduped or stored then.
 * Every other outcome is total: unknown event types become `other`, and payout
 * events with an unexpected resource shape become `malformed`.
 */
export function parsePaypalWebhookEvent(payload: unknown): PaypalWebhookEvent {
  const envelope = paypalWebhookEventEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    throw new PaypalWebhookEventError("PayPal webhook payload has no usable id/event_type");
  }

  const { id, event_type: eventType, resource_type: resourceType, resource } = envelope.data;
  const resourceId = resourceIdOf(resourceType, resource);

  if (isPayoutItemEventType(eventType)) {
    const item = payoutItemEventResourceSchema.safeParse(resource);

    if (!item.success) {
      return { kind: "malformed", eventId: id, eventType, resourceId, raw: payload };
    }

    const nested = item.data.payout_item;
    const amount = nested?.amount ?? item.data.amount;

    return {
      kind: "payout_item",
      eventId: id,
      eventType,
      itemId: item.data.payout_item_id,
      itemStatus: item.data.transaction_status,
      senderItemId: nested?.sender_item_id ?? item.data.sender_item_id,
      batchId: item.data.payout_batch_id,
      transactionId: item.data.transaction_id,
      amountCents: amount === undefined ? undefined : parseMoney(amount.value),
      currency: amount === undefined ? undefined : payoutItemCurrency(amount),
      raw: payload,
    };
  }

  if (isPayoutBatchEventType(eventType)) {
    const batch = payoutBatchEventResourceSchema.safeParse(resource);

    if (!batch.success) {
      return { kind: "malformed", eventId: id, eventType, resourceId, raw: payload };
    }

    return {
      kind: "payout_batch",
      eventId: id,
      eventType,
      batchId: batch.data.payout_batch_id,
      batchStatus: batch.data.batch_status,
      senderBatchId: batch.data.sender_batch_header?.sender_batch_id,
      createdAt: batch.data.time_created,
      raw: payload,
    };
  }

  return { kind: "other", eventId: id, eventType, resourceId, raw: payload };
}
