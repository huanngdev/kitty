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
