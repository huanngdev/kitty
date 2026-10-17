/**
 * `@kitty/paypal` — typed PayPal REST client for the Leash Gateway.
 *
 * Gateway-only: `apps/gateway` is the sole importer (AGENTS.md invariant #1,
 * enforced by ESLint `no-restricted-imports` and `scripts/check-env-isolation.ts`).
 * See docs/11-paypal-integration.md.
 */
export { createPayPalClient } from "./client";
export { PAYPAL_BASE_URLS, paypalBaseUrl } from "./base-url";
export { PayPalApiError, toPayPalApiError } from "./errors";
export type { PayPalApiErrorInit, PayPalErrorDetail } from "./errors";
export { InvoiceIdNotFoundError, extractInvoiceId, invoiceCreatedSchema } from "./invoice-id";
export {
  PAYOUT_BATCH_EVENT_TYPES,
  PAYOUT_ITEM_EVENT_TYPES,
  PaypalWebhookEventError,
  parsePaypalWebhookEvent,
  paypalWebhookEventEnvelopeSchema,
  payoutBatchEventResourceSchema,
  payoutItemEventResourceSchema,
} from "./payout-events";
export { WEBHOOK_TRANSMISSION_HEADERS, pickWebhookHeaders } from "./webhooks";
export { BACKOFF_BASE_MS, backoffMs } from "./http";
export type {
  BatchIdInput,
  CreateInvoiceInput,
  CreateOrderInput,
  CreatePayoutInput,
  CurrencyCode,
  Invoice,
  InvoiceAction,
  InvoiceActionInput,
  InvoiceIdInput,
  InvoiceItemInput,
  InvoicePayment,
  InvoiceRef,
  ItemIdInput,
  Order,
  OrderCapture,
  OrderCaptureEntry,
  OrderCaptureInput,
  OrderIdInput,
  PayPalClient,
  PayPalClientOptions,
  PayPalEnvironment,
  PayPalLogger,
  PaymentsNamespace,
  PayoutBatch,
  PayoutBatchResult,
  PayoutItem,
  PayoutsNamespace,
  OrdersNamespace,
  InvoicingNamespace,
  Refund,
  RefundCaptureInput,
  VerifyWebhookInput,
  WebhookIdInput,
  WebhookInfo,
  WebhookTransmissionHeaders,
  WebhooksNamespace,
} from "./types";
export type {
  MalformedPaypalWebhookEvent,
  OtherPaypalWebhookEvent,
  PaypalWebhookEvent,
  PaypalWebhookEventEnvelope,
  PayoutBatchEventType,
  PayoutBatchWebhookEvent,
  PayoutItemEventType,
  PayoutItemWebhookEvent,
} from "./payout-events";
