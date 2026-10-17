import { z } from "zod";

/**
 * Invoicing v2 answers a create with `201` and a HATEOAS link
 * (`{ rel, href, method }`) — the new invoice id is *not* in the body. It only
 * appears in the `Location` header (or in `href`). This schema validates that
 * shape instead of trusting an arbitrary object.
 *
 * Moved here from `apps/gateway/src/lib/paypal-sandbox.ts` so the gateway and
 * the client share one implementation (KIT-15).
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
