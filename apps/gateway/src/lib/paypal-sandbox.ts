import { z } from "zod";

/**
 * Pure helpers for `scripts/sandbox-check.ts` (apps/gateway only).
 *
 * Everything here is side-effect free so it can be unit-tested without network:
 * env validation, the PayPal base URL and the Invoicing/Payouts request bodies.
 * See docs/11-paypal-integration.md §2.1 (Invoicing) and §2.3 (Payouts).
 */

/**
 * Treat empty strings (for example `PAYPAL_WEBHOOK_ID=` in a local `.env`) as
 * unset, so a blank optional variable falls back to its default/`undefined`
 * instead of failing validation. Same rule as `src/env.ts`.
 */
const unsetIfEmpty = (value: unknown): unknown => (value === "" ? undefined : value);

/**
 * Env the sandbox check needs. Extra variables (PAYPAL_WEBHOOK_ID) are optional
 * and blank values count as unset. Required blanks are reported by
 * `missingSandboxEnvKeys` before this schema runs.
 */
export const sandboxEnvSchema = z.object({
  PAYPAL_ENV: z.preprocess(unsetIfEmpty, z.enum(["sandbox", "live"]).default("sandbox")),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PLATFORM_PAYPAL_EMAIL: z.email(),
  PAYPAL_SANDBOX_PAYER_EMAIL: z.email(),
  PAYPAL_SANDBOX_PAYEE_EMAIL: z.email(),
  PAYPAL_WEBHOOK_ID: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
});

export type SandboxEnv = z.infer<typeof sandboxEnvSchema>;

export const requiredSandboxEnvKeys = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PLATFORM_PAYPAL_EMAIL",
  "PAYPAL_SANDBOX_PAYER_EMAIL",
  "PAYPAL_SANDBOX_PAYEE_EMAIL",
] as const;

export type SandboxEnvResult =
  { ok: true; env: SandboxEnv } | { ok: false; missing: string[]; invalid: string[] };

/** Lists required keys that are absent or blank (names only — never values). */
export function missingSandboxEnvKeys(source: Record<string, string | undefined>): string[] {
  return requiredSandboxEnvKeys.filter((key) => {
    const value = source[key];

    return value === undefined || value.trim() === "";
  });
}

/** Validates the sandbox env without throwing. */
export function readSandboxEnv(source: Record<string, string | undefined>): SandboxEnvResult {
  const missing = missingSandboxEnvKeys(source);
  if (missing.length > 0) {
    return { ok: false, missing, invalid: [] };
  }

  const parsed = sandboxEnvSchema.safeParse(source);
  if (!parsed.success) {
    return {
      ok: false,
      missing: [],
      invalid: parsed.error.issues.map((issue) => issue.path.join(".")),
    };
  }

  return { ok: true, env: parsed.data };
}

/** PayPal REST base URL. The hackathon only ever runs against sandbox. */
export function paypalBaseUrl(paypalEnv: SandboxEnv["PAYPAL_ENV"]): string {
  return paypalEnv === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

/** `YYYY-MM-DD` that PayPal's `payment_term.due_date` expects. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface InvoiceDraft {
  detail: {
    currency_code: "USD";
    invoice_number: string;
    note: string;
    payment_term: { due_date: string };
  };
  invoicer: { email_address: string; business_name: string };
  primary_recipients: { billing_info: { email_address: string } }[];
  items: {
    name: string;
    quantity: string;
    unit_amount: { currency_code: "USD"; value: string };
  }[];
  configuration: { allow_tip: boolean; partial_payment: { allow_partial_payment: boolean } };
}

/** Invoicing v2 draft body (docs/11 §2.1), reduced to a single $1 item. */
export function buildInvoiceRequest(input: {
  platformEmail: string;
  payerEmail: string;
  invoiceNumber: string;
  dueDate: string;
  amountValue: string;
}): InvoiceDraft {
  return {
    detail: {
      currency_code: "USD",
      invoice_number: input.invoiceNumber,
      note: "Kitty sandbox check — please ignore.",
      payment_term: { due_date: input.dueDate },
    },
    invoicer: {
      email_address: input.platformEmail,
      business_name: "Kitty — sandbox check",
    },
    primary_recipients: [{ billing_info: { email_address: input.payerEmail } }],
    items: [
      {
        name: "Sandbox check",
        quantity: "1",
        unit_amount: { currency_code: "USD", value: input.amountValue },
      },
    ],
    configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } },
  };
}

/**
 * Body of `POST /v2/invoicing/invoices`.
 *
 * Invoicing v2 answers a create with `201` and a HATEOAS link
 * (`{ rel, href, method }`) — the new invoice id is *not* in the body. It only
 * appears in the `Location` header (or in `href`). This schema validates that
 * shape instead of trusting an arbitrary object.
 */
export const invoiceCreatedSchema = z.object({
  id: z.string().min(1).optional(),
  href: z.string().min(1).optional(),
});

export type InvoiceCreated = z.infer<typeof invoiceCreatedSchema>;

/** Thrown when a PayPal create response carries no usable invoice id. */
export class InvoiceIdNotFoundError extends Error {
  constructor() {
    super("PayPal returned no invoice id (checked body.id, body.href and the Location header)");
    this.name = "InvoiceIdNotFoundError";
  }
}

/** `/v2/invoicing/invoices/{id}` — the path PayPal uses in `href` and `Location`. */
const INVOICE_PATH = /\/invoicing\/invoices\/([^/?#]+)/;

/** Last path segment of a URL or bare path, ignoring query/hash. */
function lastPathSegment(value: string): string | undefined {
  const path = value.split(/[?#]/)[0] ?? "";
  const segments = path.split("/").filter((segment) => segment.length > 0);

  return segments.at(-1);
}

/**
 * Reads the invoice id from a `POST /v2/invoicing/invoices` response.
 *
 * Preference order (docs/11 §2.1): `body.id`, then the id in `body.href`, then
 * the `Location` header. Throws `InvoiceIdNotFoundError` when none is present,
 * so a silent `undefined` can never reach the money path.
 */
export function extractInvoiceId(input: { body: unknown; location?: string | null }): string {
  const parsed = invoiceCreatedSchema.safeParse(input.body);

  if (parsed.success) {
    if (parsed.data.id !== undefined) {
      return parsed.data.id;
    }

    if (parsed.data.href !== undefined) {
      const id = parsed.data.href.match(INVOICE_PATH)?.[1] ?? lastPathSegment(parsed.data.href);
      if (id !== undefined && id.length > 0) {
        return id;
      }
    }
  }

  if (typeof input.location === "string" && input.location.length > 0) {
    const id = input.location.match(INVOICE_PATH)?.[1] ?? lastPathSegment(input.location);
    if (id !== undefined && id.length > 0) {
      return id;
    }
  }

  throw new InvoiceIdNotFoundError();
}

export interface PayoutRequest {
  sender_batch_header: {
    sender_batch_id: string;
    email_subject: string;
    email_message: string;
  };
  items: {
    recipient_type: "EMAIL";
    amount: { value: string; currency: "USD" };
    receiver: string;
    note: string;
    sender_item_id: string;
  }[];
}

/** Payouts v1 body (docs/11 §2.3): 1 batch = 1 item. */
export function buildPayoutRequest(input: {
  payeeEmail: string;
  senderBatchId: string;
  amountValue: string;
  note: string;
}): PayoutRequest {
  return {
    sender_batch_header: {
      sender_batch_id: input.senderBatchId,
      email_subject: "Payment from Kitty — sandbox check",
      email_message: "This is a Kitty sandbox check. No action needed.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: { value: input.amountValue, currency: "USD" },
        receiver: input.payeeEmail,
        note: input.note,
        sender_item_id: input.senderBatchId,
      },
    ],
  };
}
