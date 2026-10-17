import { errorCodes } from "@kitty/shared";
import { AppError } from "./errors";

/**
 * Narrows a free-form `text` column back to the shared enum union it is meant
 * to hold. The cast happens only after a runtime check, so it is sound
 * (CODE_RULES.md §B). A value outside the set is a server-side invariant break.
 */
export function narrowEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }

  throw new AppError(errorCodes.internal, 500, { context: `${field} has an unexpected value` });
}
