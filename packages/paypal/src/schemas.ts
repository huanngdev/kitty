import { z } from "zod";

/**
 * Zod models for the PayPal wire format. Only the fields Kitty uses are
 * modelled (unknown fields are stripped, no `.passthrough()` needed). Every
 * money string is validated then converted to bigint cents with `parseMoney`
 * so a malformed amount can never reach the money path (AGENTS.md §3).
 */

export const paypalEnvironmentSchema = z.enum(["sandbox", "live"]);

export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "expected a 3-letter ISO 4217 currency code");

export const moneyWireSchema = z
  .string()
  .regex(/^\d+\.\d{2}$/, 'expected a money string like "12.34"');

/** `{ currency_code, value }` wire amount, mapped to bigint cents. */
export const amountSchema = z.object({
  currency_code: currencyCodeSchema,
  value: moneyWireSchema,
});

/**
 * A **payout item** amount. PayPal spells the currency `currency` in the payout
 * item model but `currency_code` in some REST responses; both are accepted and
 * normalised by {@link payoutItemCurrency} (docs/11 §2.3).
 */
export const payoutItemAmountSchema = z.union([
  z.object({ currency: currencyCodeSchema, value: moneyWireSchema }),
  z.object({ currency_code: currencyCodeSchema, value: moneyWireSchema }),
]);

export type PayoutItemAmount = z.infer<typeof payoutItemAmountSchema>;

/** Currency of an amount parsed by {@link payoutItemAmountSchema}. */
export function payoutItemCurrency(amount: PayoutItemAmount): string {
  return "currency" in amount ? amount.currency : amount.currency_code;
}

export const linkSchema = z.object({
  rel: z.string(),
  href: z.string(),
  method: z.string().optional(),
});

// --- token -----------------------------------------------------------------

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().finite().positive(),
  token_type: z.string().optional(),
});

// --- invoicing v2 ----------------------------------------------------------

export const invoiceActionSchema = z.object({
  status: z.string().optional(),
  href: z.string().optional(),
});

const invoicePaymentSchema = z.object({
  payment_id: z.string().optional(),
  amount: amountSchema.optional(),
});

export const invoiceSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  detail: z
    .object({
      invoice_number: z.string().optional(),
      currency_code: currencyCodeSchema.optional(),
      reference: z.string().optional(),
    })
    .optional(),
  payments: z
    .object({
      transactions: z.array(invoicePaymentSchema).optional(),
    })
    .optional(),
  links: z.array(linkSchema).optional(),
});

// --- payouts v1 ------------------------------------------------------------

export const payoutItemSchema = z.object({
  payout_item_id: z.string(),
  transaction_status: z.string(),
  payout_batch_id: z.string().optional(),
  sender_item_id: z.string().optional(),
  amount: payoutItemAmountSchema.optional(),
  /**
   * PayPal's payout item model, nested inside the item in `GET
   * /v1/payments/payouts/{batch_id}` and `/v1/payments/payouts-item/{id}` (and
   * in some webhook payloads). The item lookup key `sender_item_id` and the
   * amount live here, not at the item's top level.
   */
  payout_item: z
    .object({
      amount: payoutItemAmountSchema.optional(),
      sender_item_id: z.string().optional(),
      note: z.string().optional(),
    })
    .optional(),
});

const payoutBatchHeaderSchema = z.object({
  payout_batch_id: z.string(),
  batch_status: z.string(),
  sender_batch_id: z.string().optional(),
  time_created: z.string().optional(),
});

export const payoutCreateSchema = z.object({
  batch_header: payoutBatchHeaderSchema,
});

export const payoutBatchSchema = z.object({
  batch_header: payoutBatchHeaderSchema.optional(),
  items: z.array(payoutItemSchema).optional(),
});

// --- orders v2 -------------------------------------------------------------

export const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(linkSchema).optional(),
});

export const captureSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: amountSchema.optional(),
  invoice_id: z.string().optional(),
});

export const orderCaptureSchema = z.object({
  id: z.string(),
  status: z.string(),
  purchase_units: z
    .array(
      z.object({
        payments: z
          .object({
            captures: z.array(captureSchema).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

// --- payments v2 -----------------------------------------------------------

export const refundSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: amountSchema.optional(),
  invoice_id: z.string().optional(),
});

// --- notifications v1 ------------------------------------------------------

export const verifyWebhookResponseSchema = z.object({
  verification_status: z.string(),
});

export const webhookSchema = z.object({
  id: z.string(),
  url: z.string().optional(),
  event_types: z.array(z.object({ name: z.string().optional() })).optional(),
});

// --- outward request bodies ------------------------------------------------
// Built from typed input then parsed so a malformed body is caught before it
// leaves the gateway.

export const invoiceDraftRequestSchema = z.object({
  detail: z.object({
    currency_code: currencyCodeSchema,
    invoice_number: z.string().min(1),
    reference: z.string().min(1).optional(),
    note: z.string().optional(),
    payment_term: z.object({ due_date: z.string().min(1) }),
  }),
  invoicer: z.object({
    email_address: z.email(),
    business_name: z.string().min(1).optional(),
  }),
  primary_recipients: z
    .array(
      z.object({
        billing_info: z.object({
          email_address: z.email(),
          name: z.object({ given_name: z.string().min(1) }).optional(),
        }),
      }),
    )
    .min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.string().min(1),
        unit_amount: amountSchema,
      }),
    )
    .min(1),
  configuration: z.object({
    allow_tip: z.boolean(),
    partial_payment: z.object({ allow_partial_payment: z.boolean() }),
  }),
});

export const payoutRequestSchema = z.object({
  sender_batch_header: z.object({
    sender_batch_id: z.string().min(1),
    email_subject: z.string().min(1),
    email_message: z.string().min(1),
  }),
  items: z
    .array(
      z.object({
        recipient_type: z.literal("EMAIL"),
        amount: z.object({ value: moneyWireSchema, currency: currencyCodeSchema }),
        receiver: z.email(),
        note: z.string(),
        sender_item_id: z.string().min(1),
      }),
    )
    .min(1),
});

export const orderRequestSchema = z.object({
  intent: z.literal("CAPTURE"),
  purchase_units: z
    .array(
      z.object({
        custom_id: z.string().min(1),
        invoice_id: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        amount: z.object({ currency_code: currencyCodeSchema, value: moneyWireSchema }),
      }),
    )
    .min(1),
});

export const refundRequestSchema = z.object({
  amount: z.object({ value: moneyWireSchema, currency_code: currencyCodeSchema }).optional(),
  invoice_id: z.string().min(1).optional(),
  note_to_payer: z.string().optional(),
});

export const verifyWebhookRequestSchema = z.object({
  transmission_id: z.string().min(1),
  transmission_time: z.string().min(1),
  cert_url: z.string().min(1),
  auth_algo: z.string().min(1),
  transmission_sig: z.string().min(1),
  webhook_id: z.string().min(1),
  webhook_event: z.unknown(),
});
