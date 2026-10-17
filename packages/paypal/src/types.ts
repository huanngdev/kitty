import type { AxiosInstance } from "axios";

/** PayPal REST environment. The hackathon only ever runs against `sandbox`. */
export type PayPalEnvironment = "sandbox" | "live";

/** ISO 4217 currency code, for example `USD`. Validated at every call edge. */
export type CurrencyCode = string;

/**
 * Minimal structured logger. The signature deliberately matches `pino`
 * (`(event, message)`) so `apps/gateway` can pass its logger straight in — the
 * client never logs secrets or access tokens (AGENTS.md §3, CODE_RULES §D).
 */
export interface PayPalLogger {
  debug(event: Record<string, unknown>, message: string): void;
  warn(event: Record<string, unknown>, message: string): void;
  error(event: Record<string, unknown>, message: string): void;
}

/** Options of {@link createPayPalClient}. Every side effect is injectable. */
export interface PayPalClientOptions {
  /** PayPal environment; selects the REST base URL. */
  readonly env: PayPalEnvironment;
  /** OAuth2 client id. Only `apps/gateway` may hold it (AGENTS.md #1). */
  readonly clientId: string;
  /** OAuth2 client secret. Never logged, never put in an error. */
  readonly clientSecret: string;
  /** Pre-configured axios instance (tests, custom agents). Defaults to a new one. */
  readonly http?: AxiosInstance;
  /** Clock in milliseconds; defaults to `Date.now`. Injected for token tests. */
  readonly now?: () => number;
  /** Sleep helper for backoff; defaults to `setTimeout`. Injected for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Structured logger; optional. Never receives secrets. */
  readonly logger?: PayPalLogger;
  /** Total attempts per request (including the first). Defaults to 3. */
  readonly maxAttempts?: number;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  readonly timeoutMs?: number;
}

/** The public surface returned by {@link createPayPalClient}. */
export interface PayPalClient {
  /** Environment this client was built for. */
  readonly environment: PayPalEnvironment;
  /** PayPal REST base URL in use. */
  readonly baseUrl: string;
  readonly invoicing: InvoicingNamespace;
  readonly payouts: PayoutsNamespace;
  readonly orders: OrdersNamespace;
  readonly payments: PaymentsNamespace;
  readonly webhooks: WebhooksNamespace;
  /**
   * Acquires (or reuses) an OAuth2 access token, proving the client
   * credentials work. Returns nothing and never exposes the token.
   */
  verifyCredentials(): Promise<void>;
}

/** Invoicing v2 (docs/11-paypal-integration.md §2.1). */
export interface InvoicingNamespace {
  createDraft(input: CreateInvoiceInput): Promise<InvoiceRef>;
  send(input: InvoiceActionInput): Promise<InvoiceAction>;
  get(input: InvoiceIdInput): Promise<Invoice>;
  remind(input: InvoiceActionInput): Promise<InvoiceAction>;
  cancel(input: InvoiceActionInput): Promise<InvoiceAction>;
}

/** Payouts v1 (docs/11 §2.3). 1 intent = 1 batch = 1 item. */
export interface PayoutsNamespace {
  createSingle(input: CreatePayoutInput): Promise<PayoutBatchResult>;
  getBatch(input: BatchIdInput): Promise<PayoutBatch>;
  getItem(input: ItemIdInput): Promise<PayoutItem>;
}

/** Orders v2 (docs/11 §2.2). */
export interface OrdersNamespace {
  create(input: CreateOrderInput): Promise<Order>;
  get(input: OrderIdInput): Promise<Order>;
  capture(input: OrderCaptureInput): Promise<OrderCapture>;
}

/** Payments v2 refunds (docs/11 §2.4). */
export interface PaymentsNamespace {
  refundCapture(input: RefundCaptureInput): Promise<Refund>;
}

/** Notifications v1 webhook verification (docs/11 §3). */
export interface WebhooksNamespace {
  verifySignature(input: VerifyWebhookInput): Promise<boolean>;
  getWebhook(input: WebhookIdInput): Promise<WebhookInfo>;
}

export interface CreateInvoiceInput {
  /** Idempotency key sent as `PayPal-Request-Id`. Required on every POST. */
  readonly requestId: string;
  readonly invoiceNumber: string;
  readonly currency: CurrencyCode;
  /** `YYYY-MM-DD` payment due date. */
  readonly dueDate: string;
  readonly invoicerEmail: string;
  readonly invoicerBusinessName?: string;
  readonly recipientEmail: string;
  readonly recipientName?: string;
  /** Maps webhooks back to the spend intent (docs/11 §2.1). */
  readonly reference?: string;
  readonly note?: string;
  readonly items: readonly InvoiceItemInput[];
  readonly allowTip?: boolean;
  readonly allowPartialPayment?: boolean;
}

export interface InvoiceItemInput {
  readonly name: string;
  /** PayPal expects a decimal string, for example `"1"`. */
  readonly quantity: string;
  /** Item price in integer cents; formatted with `formatMoney` at the edge. */
  readonly amountCents: bigint;
}

export interface InvoiceIdInput {
  readonly invoiceId: string;
}

/** Input of every mutating invoice call (send, remind, cancel). */
export interface InvoiceActionInput {
  readonly invoiceId: string;
  readonly requestId: string;
}

export interface CreatePayoutInput {
  /** Idempotency key; also used as `sender_batch_id` (docs/11 §2.3). */
  readonly requestId: string;
  readonly senderBatchId: string;
  readonly payeeEmail: string;
  /** Amount in integer cents; formatted with `formatMoney` at the edge. */
  readonly amountCents: bigint;
  readonly currency: CurrencyCode;
  readonly note: string;
  readonly emailSubject?: string;
  readonly emailMessage?: string;
}

export interface BatchIdInput {
  readonly batchId: string;
}

export interface ItemIdInput {
  readonly itemId: string;
}

export interface CreateOrderInput {
  readonly requestId: string;
  /** Stored as `purchase_units[0].custom_id` to map webhooks back. */
  readonly kittyId: string;
  readonly invoiceId?: string;
  readonly amountCents: bigint;
  readonly currency: CurrencyCode;
  readonly description?: string;
}

export interface OrderIdInput {
  readonly orderId: string;
}

/** Input of `orders.capture`; the request id keeps the capture idempotent. */
export interface OrderCaptureInput {
  readonly orderId: string;
  readonly requestId: string;
}

export interface RefundCaptureInput {
  readonly requestId: string;
  readonly captureId: string;
  /** Partial refund amount in cents; omitted = full refund. */
  readonly amountCents?: bigint;
  readonly currency?: CurrencyCode;
  readonly invoiceId?: string;
  readonly note?: string;
}

export interface WebhookIdInput {
  readonly webhookId: string;
}

export interface VerifyWebhookInput {
  /** Request headers, matched case-insensitively for the transmission headers. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Raw request body (never re-encoded). */
  readonly rawBody: string;
  readonly webhookId: string;
}

// ---------------------------------------------------------------------------
// Domain results (money is bigint cents; PayPal wire strings never escape)
// ---------------------------------------------------------------------------

export interface InvoiceRef {
  readonly invoiceId: string;
}

export interface InvoiceAction {
  readonly invoiceId: string;
  readonly status?: string;
  readonly href?: string;
}

export interface InvoicePayment {
  readonly captureId: string;
  readonly amountCents?: bigint;
  readonly currency?: string;
}

export interface Invoice {
  readonly invoiceId: string;
  readonly status?: string;
  readonly invoiceNumber?: string;
  readonly currency?: string;
  readonly reference?: string;
  /** "payer-view" link so the UI can open the invoice without email. */
  readonly payerUrl?: string;
  readonly payments: readonly InvoicePayment[];
}

export interface PayoutBatchResult {
  readonly batchId: string;
  readonly status: string;
}

export interface PayoutItem {
  readonly itemId: string;
  readonly status: string;
  readonly batchId?: string;
  readonly senderItemId?: string;
  readonly amountCents?: bigint;
  readonly currency?: string;
}

export interface PayoutBatch {
  readonly batchId?: string;
  readonly senderBatchId?: string;
  readonly status?: string;
  readonly createdAt?: string;
  readonly items: readonly PayoutItem[];
}

export interface Order {
  readonly orderId: string;
  readonly status: string;
  /** `approve` HATEOAS link used by the JS SDK v6 flow. */
  readonly approveUrl?: string;
}

export interface OrderCaptureEntry {
  readonly captureId: string;
  readonly status: string;
  readonly amountCents?: bigint;
  readonly currency?: string;
}

export interface OrderCapture {
  readonly orderId: string;
  readonly status: string;
  readonly captures: readonly OrderCaptureEntry[];
}

export interface Refund {
  readonly refundId: string;
  readonly status: string;
  readonly amountCents?: bigint;
  readonly currency?: string;
  readonly invoiceId?: string;
}

export interface WebhookInfo {
  readonly id: string;
  readonly url?: string;
  readonly eventTypes: readonly string[];
}

/** The five `PAYPAL-TRANSMISSION-*` headers PayPal signs (docs/11 §3). */
export interface WebhookTransmissionHeaders {
  readonly transmissionId: string;
  readonly transmissionTime: string;
  readonly certUrl: string;
  readonly authAlgo: string;
  readonly transmissionSig: string;
}
