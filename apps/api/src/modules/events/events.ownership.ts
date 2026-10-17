import type { EventRow } from "@kitty/db";
import { errorCodes } from "@kitty/shared";
import { AppError } from "../../lib/errors";
import type { EventsRepository } from "./events.repository";

/**
 * Authorization guard shared by every event-scoped module (docs/10-api-spec.md
 * §4): the only person allowed to touch an event is its organizer. Unknown ids
 * are `404 EVENT_NOT_FOUND`; a known event owned by somebody else is
 * `403 FORBIDDEN`.
 *
 * Pure and repository-agnostic so the services stay unit-testable.
 */
export async function requireOwnedEvent(
  events: EventsRepository,
  eventId: string,
  actorUserId: string,
): Promise<EventRow> {
  const event = await events.findById(eventId);

  if (event === undefined) {
    throw new AppError(errorCodes.eventNotFound, 404, { eventId });
  }

  if (event.organizerId !== actorUserId) {
    throw new AppError(errorCodes.forbidden, 403, { eventId });
  }

  return event;
}
