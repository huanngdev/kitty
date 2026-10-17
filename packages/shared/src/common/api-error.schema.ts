import { z } from "zod";

/**
 * Generic error codes returned by Kitty services.
 *
 * The `code` field of an API error is a free-form string so modules can add
 * their own domain codes; this map covers the codes every service can return.
 * The wire shape is defined by `apiErrorSchema`.
 */
export const errorCodes = {
  badRequest: "BAD_REQUEST",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  validationFailed: "VALIDATION_FAILED",
  rateLimited: "RATE_LIMITED",
  internal: "INTERNAL",

  // --- Gateway Admin API (docs/10-api-spec.md §1) ---
  kittyNotFound: "KITTY_NOT_FOUND",
  agentNotFound: "AGENT_NOT_FOUND",
  leashNotFound: "LEASH_NOT_FOUND",
  payeeNotFound: "PAYEE_NOT_FOUND",
  invalidStateTransition: "INVALID_STATE_TRANSITION",
  allocationExceedsKittyAvailable: "ALLOCATION_EXCEEDS_KITTY_AVAILABLE",
  expiryTooLong: "EXPIRY_TOO_LONG",
  payeeNotVerified: "PAYEE_NOT_VERIFIED",
  agentAlreadyLeashed: "AGENT_ALREADY_LEASHED",
  invalidLeashLimits: "INVALID_LEASH_LIMITS",
  invalidExpiry: "INVALID_EXPIRY",
  invalidPublicKey: "INVALID_PUBLIC_KEY",

  // --- Gateway Agent API / MCP (docs/10-api-spec.md §2) ---
  /** The same `intentId` was resubmitted with a different body (docs/10 §2). */
  intentIdReused: "INTENT_ID_REUSED",
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

/** The single error shape every Kitty API returns: `{ error: { code, message, details? } }`. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
