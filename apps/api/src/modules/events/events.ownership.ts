import type { EventRow } from "@kitty/db";
import { errorCodes } from "@kitty/shared";
import { AppError } from "../../lib/errors";
import type { EventsRepository } from "./events.repository";

/**
 * Authorization guard shared by every event-scoped module (docs/10 §4, ADR-029):
 * only the event's organizer may touch it. Both an unknown id and a known event
 * owned by somebody else answer `404 EVENT_NOT_FOUND` — never 403, which would
 * confirm that the id exists.
 *
 * Pure and repository-agnostic so the services stay unit-testable. The primary
 * gate is the `requireEventOrganizer` middleware; this is the second line of
 * defense inside the service.
 */
export async function requireOwnedEvent(
  events: EventsRepository,
  eventId: string,
  actorUserId: string,
): Promise<EventRow> {
  const event = await events.findById(eventId);

  if (event === undefined || event.organizerId !== actorUserId) {
    throw new AppError(errorCodes.eventNotFound, 404, { eventId });
  }

  return event;
}
