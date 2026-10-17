import { errorCodes } from "@kitty/shared";
import { AppError } from "./errors";

/**
 * Cursor helpers. Cursors are opaque to clients but, for the gateway, they are
 * the numeric `bigserial` id of the last row of the previous page (docs/10
 * §1: newest-first feeds).
 */
export function parseCursor(cursor: string | undefined): number | undefined {
  if (cursor === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(cursor)) {
    throw new AppError(errorCodes.validationFailed, 400, {
      issues: [{ path: ["cursor"], message: "cursor must be a numeric id" }],
    });
  }

  return Number(cursor);
}
