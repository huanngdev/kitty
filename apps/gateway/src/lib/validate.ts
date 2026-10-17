import { errorCodes } from "@kitty/shared";
import { AppError } from "./errors";

/**
 * Shared `@hono/zod-validator` hook (CODE_RULES.md §D): a validation failure
 * becomes the shared `{ error: { code, message, details } }` shape instead of
 * the package default, so every route reports errors the same way.
 *
 * The result is typed structurally so the hook stays compatible with the
 * validator's Zod-4 error type without importing its internal generics.
 */

export interface ZodIssueLike {
  readonly path?: ReadonlyArray<PropertyKey>;
  readonly message: string;
}

export interface ValidationResultLike {
  readonly success: boolean;
  readonly error?: { readonly issues: ReadonlyArray<ZodIssueLike> };
}

export function validationHook(result: ValidationResultLike): void {
  if (result.success) {
    return;
  }

  const issues = result.error?.issues ?? [];

  throw new AppError(errorCodes.validationFailed, 400, {
    issues: issues.map((issue) => ({
      path: (issue.path ?? []).map((segment) => String(segment)),
      message: issue.message,
    })),
  });
}
