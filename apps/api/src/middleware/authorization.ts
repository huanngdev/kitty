import type { EventRow } from "@kitty/db";
import { errorCodes } from "@kitty/shared";
import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors";
import type { AppEnv } from "./session";

/**
 * Event-scoped authorization (docs/10-api-spec.md §4, ADR-029).
 *
 * A request that names an event the caller does not own gets `404
 * EVENT_NOT_FOUND`, exactly like a non-existent id. Returning 403 would confirm
 * that the id exists, letting a signed-in attacker enumerate other organizers'
 * events — the id itself is unguessable, but leaking its existence is still a
 * free oracle. The middleware also stores the row in `c.var.event` so handlers
 * (and services that want a second check) do not query it again.
 */
export interface EventLookup {
  findById(id: string): Promise<EventRow | undefined>;
}

export interface RequireEventOrganizerDeps {
  /** Repository lookup; injected so route tests can use a fake. */
  readonly events: EventLookup;
  /** Path parameter that carries the event id (default `"id"`). */
  readonly param?: string;
}

export function createRequireEventOrganizer(
  deps: RequireEventOrganizerDeps,
): MiddlewareHandler<AppEnv> {
  const param = deps.param ?? "id";

  return async (c, next) => {
    const eventId = c.req.param(param);

    if (eventId === undefined || eventId.length === 0) {
      throw new AppError(errorCodes.badRequest, 400, { reason: `missing ${param}` });
    }

    const event = await deps.events.findById(eventId);

    if (event === undefined) {
      throw new AppError(errorCodes.eventNotFound, 404, { eventId });
    }

    const user = c.get("user");

    if (user === null) {
      throw new AppError(errorCodes.unauthenticated, 401, { reason: "sign in required" });
    }

    if (event.organizerId !== user.id) {
      // Same shape as "not found" on purpose — never leak that the event exists.
      throw new AppError(errorCodes.eventNotFound, 404, { eventId });
    }

    c.set("event", event);

    await next();
  };
}
