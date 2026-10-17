import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Application error. Hono's single `onError` handler maps it to the shared
 * `{ error: { code, message, details } }` shape (CODE_RULES.md §D).
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: ContentfulStatusCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "AppError";
  }
}
