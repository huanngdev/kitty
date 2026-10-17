import axios from "axios";
import { z } from "zod";

/**
 * One entry of a PayPal error `details` array.
 */
export interface PayPalErrorDetail {
  readonly field: string | undefined;
  readonly value: string | undefined;
  readonly location: string | undefined;
  readonly issue: string | undefined;
  readonly description: string | undefined;
}

export interface PayPalApiErrorInit {
  readonly status: number | undefined;
  readonly paypalName: string | undefined;
  readonly message: string;
  readonly debugId: string | undefined;
  readonly issueCodes: readonly string[];
  readonly details: readonly PayPalErrorDetail[];
}

/**
 * The single error type for everything `@kitty/paypal` throws: PayPal REST
 * error bodies and network failures alike.
 *
 * It never holds the client secret, an access token or an `Authorization`
 * header — {@link PayPalApiError.toJSON} (and the enumerable properties) are
 * safe to serialize into logs (AGENTS.md §3, invariant #11).
 */
export class PayPalApiError extends Error {
  readonly code = "PAYPAL_API";
  readonly status: number | undefined;
  /** PayPal's machine name, for example `INVALID_REQUEST`. */
  readonly paypalName: string | undefined;
  /** PayPal's `debug_id`, for support tickets. */
  readonly debugId: string | undefined;
  /** Top-level name plus every `details[].issue`, de-duplicated. */
  readonly issueCodes: readonly string[];
  readonly details: readonly PayPalErrorDetail[];

  constructor(init: PayPalApiErrorInit) {
    super(init.message);
    this.name = "PayPalApiError";
    this.status = init.status;
    this.paypalName = init.paypalName;
    this.debugId = init.debugId;
    this.issueCodes = init.issueCodes;
    this.details = init.details;
  }

  /** Explicit safe shape so serialization can never leak credentials. */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      name: this.name,
      status: this.status,
      paypalName: this.paypalName,
      message: this.message,
      debugId: this.debugId,
      issueCodes: this.issueCodes,
      details: this.details,
    };
  }
}

const errorDetailSchema = z.object({
  field: z.string().optional(),
  value: z.string().optional(),
  location: z.string().optional(),
  issue: z.string().optional(),
  description: z.string().optional(),
});

/**
 * PayPal error bodies are not uniform: OAuth answers `{ error, error_description }`,
 * REST APIs answer `{ name, message, debug_id, details[] }`. Every field is
 * optional so any shape parses; only the fields we surface are modelled.
 */
const errorBodySchema = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  debug_id: z.string().optional(),
  details: z.array(errorDetailSchema).optional(),
});

interface ParsedErrorBody {
  readonly name: string | undefined;
  readonly message: string | undefined;
  readonly debugId: string | undefined;
  readonly issueCodes: readonly string[];
  readonly details: readonly PayPalErrorDetail[];
}

function readErrorBody(data: unknown): ParsedErrorBody {
  const parsed = errorBodySchema.safeParse(data);
  if (!parsed.success) {
    return { name: undefined, message: undefined, debugId: undefined, issueCodes: [], details: [] };
  }

  const details: PayPalErrorDetail[] = (parsed.data.details ?? []).map((detail) => ({
    field: detail.field,
    value: detail.value,
    location: detail.location,
    issue: detail.issue,
    description: detail.description,
  }));

  const name = parsed.data.name ?? parsed.data.error;
  const issueCodes = [
    ...new Set([
      ...(name !== undefined ? [name] : []),
      ...details.flatMap((detail) => (detail.issue !== undefined ? [detail.issue] : [])),
    ]),
  ];

  return {
    name,
    message: parsed.data.message ?? parsed.data.error_description,
    debugId: parsed.data.debug_id,
    issueCodes,
    details,
  };
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (headers === null || typeof headers !== "object") {
    return undefined;
  }

  const direct = Reflect.get(headers, name);
  if (typeof direct === "string") {
    return direct;
  }

  const lower = Reflect.get(headers, name.toLowerCase());

  return typeof lower === "string" ? lower : undefined;
}

/**
 * Normalises anything thrown by the transport into a {@link PayPalApiError}.
 *
 * The original axios error is deliberately not attached as `cause`: it carries
 * the request config, including the `Authorization` header. Only the response
 * status and body are read.
 */
export function toPayPalApiError(error: unknown): PayPalApiError {
  if (error instanceof PayPalApiError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = readErrorBody(error.response?.data);
    const fallback =
      status === undefined
        ? `PayPal request failed before a response${error.code !== undefined ? ` (${error.code})` : ""}`
        : `PayPal request failed with status ${status}`;

    return new PayPalApiError({
      status,
      paypalName: body.name,
      message: body.message ?? fallback,
      debugId: body.debugId ?? readHeader(error.response?.headers, "paypal-debug-id"),
      issueCodes: body.issueCodes,
      details: body.details,
    });
  }

  if (error instanceof Error) {
    return new PayPalApiError({
      status: undefined,
      paypalName: undefined,
      message: error.message,
      debugId: undefined,
      issueCodes: [],
      details: [],
    });
  }

  return new PayPalApiError({
    status: undefined,
    paypalName: undefined,
    message: "Unknown PayPal client failure",
    debugId: undefined,
    issueCodes: [],
    details: [],
  });
}
