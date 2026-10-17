import type { KittyRow } from "@kitty/db";
import { errorCodes } from "@kitty/shared";
import { AppError } from "./errors";

/**
 * Ownership guards of the Gateway Admin API (docs/10-api-spec.md §1): a route
 * only ever acts on a kitty the authenticated organizer owns. Unknown ids are
 * `404 *_NOT_FOUND`, a known kitty owned by somebody else is `403 FORBIDDEN`.
 *
 * These are pure so services can be unit-tested without a database.
 */

/** Throws `KITTY_NOT_FOUND` (404) when the row is missing, else returns it. */
export function requireKitty(kitty: KittyRow | undefined): KittyRow {
  if (kitty === undefined) {
    throw new AppError(errorCodes.kittyNotFound, 404);
  }

  return kitty;
}

/** Throws `FORBIDDEN` (403) unless `userId` owns `kitty`. */
export function assertKittyOwner(kitty: KittyRow, userId: string): void {
  if (kitty.ownerUserId !== userId) {
    throw new AppError(errorCodes.forbidden, 403, { kittyId: kitty.id });
  }
}

/** `requireKitty` + `assertKittyOwner` in one step. */
export function requireOwnedKitty(kitty: KittyRow | undefined, userId: string): KittyRow {
  const found = requireKitty(kitty);
  assertKittyOwner(found, userId);
  return found;
}
