import type { EventRow, NewEvent } from "@kitty/db";
import { formatMoney, parseMoney } from "@kitty/ledger";
import { errorCodes, idPrefixes, newId } from "@kitty/shared";
import {
  type CreateEventInput,
  type Event,
  type EventStatus,
  type UpdateEventInput,
  eventStatusSchema,
} from "@kitty/shared/events";
import { AppError } from "../../lib/errors";
import { gatewayAdminClient, type GatewayAdminClient } from "../../lib/gateway-client";
import { getDb } from "../../lib/db";
import { narrowEnum } from "../../lib/narrow";
import { requireOwnedEvent } from "./events.ownership";
import { type EventsRepository, createEventsRepository } from "./events.repository";

/**
 * Event service (docs/10-api-spec.md §4). Business logic only — no Hono types,
 * no Drizzle. Money is parsed to cents here and formatted back for the wire.
 */

function toEventStatus(value: string): EventStatus {
  return narrowEnum(value, eventStatusSchema.options, "event.status");
}

/** Maps a DB row to the wire contract (money: bigint cents → `"12.34"`). */
export function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    organizerId: row.organizerId,
    title: row.title,
    description: row.description,
    location: row.location,
    timezone: row.timezone,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    currency: row.currency,
    budget: formatMoney(row.budgetCents),
    perMember: row.perMemberCents === null ? null : formatMoney(row.perMemberCents),
    status: toEventStatus(row.status),
    kittyId: row.kittyId,
    createdAt: row.createdAt.toISOString(),
  };
}

function assertDateOrder(startsOn: string, endsOn: string): void {
  if (startsOn > endsOn) {
    throw new AppError(errorCodes.validationFailed, 400, {
      issues: [{ path: ["endsOn"], message: "endsOn must be on or after startsOn" }],
    });
  }
}

function patchFromInput(input: UpdateEventInput): Partial<NewEvent> {
  const patch: Partial<NewEvent> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.location !== undefined) patch.location = input.location;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.startsOn !== undefined) patch.startsOn = input.startsOn;
  if (input.endsOn !== undefined) patch.endsOn = input.endsOn;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.budget !== undefined) patch.budgetCents = parseMoney(input.budget);
  if (input.perMember !== undefined) {
    patch.perMemberCents = input.perMember === null ? null : parseMoney(input.perMember);
  }
  if (input.status !== undefined) patch.status = input.status;

  return patch;
}

export interface EventsService {
  create(input: CreateEventInput, actorUserId: string): Promise<Event>;
  list(actorUserId: string): Promise<Event[]>;
  get(id: string, actorUserId: string): Promise<Event>;
  update(id: string, input: UpdateEventInput, actorUserId: string): Promise<Event>;
}

export interface EventsServiceDeps {
  readonly events: EventsRepository;
  readonly gateway: GatewayAdminClient;
}

export function createEventsService(deps: EventsServiceDeps): EventsService {
  return {
    /**
     * Creates the event and its gateway kitty.
     *
     * The two writes cannot share a transaction (the gateway is a separate
     * service), so this is a compensating flow: insert the event, then create
     * the kitty. If the kitty call or the follow-up `kitty_id` write fails, the
     * event row is deleted again and the error is re-thrown — the caller never
     * observes an event without a kitty. The reverse leak (a kitty whose event
     * was rolled back) cannot happen because the delete only runs after a failed
     * or absent kitty, and the gateway has no delete-kitty endpoint.
     */
    async create(input, actorUserId) {
      assertDateOrder(input.startsOn, input.endsOn);

      const event = await deps.events.insert({
        id: newId(idPrefixes.event),
        organizerId: actorUserId,
        title: input.title,
        description: input.description,
        location: input.location,
        timezone: input.timezone,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        currency: input.currency,
        budgetCents: parseMoney(input.budget),
        perMemberCents: input.perMember === null ? null : parseMoney(input.perMember),
        status: "planning",
      });

      try {
        const kitty = await deps.gateway.createKitty({ userId: actorUserId, eventId: event.id });
        const updated = await deps.events.setKittyId(event.id, kitty.id);

        if (updated === undefined) {
          throw new AppError(errorCodes.internal, 500, { context: "event kitty_id write" });
        }

        return toEvent(updated);
      } catch (error) {
        await deps.events.deleteById(event.id);
        throw error;
      }
    },

    async list(actorUserId) {
      const rows = await deps.events.listByOrganizer(actorUserId);

      return rows.map(toEvent);
    },

    async get(id, actorUserId) {
      return toEvent(await requireOwnedEvent(deps.events, id, actorUserId));
    },

    async update(id, input, actorUserId) {
      const existing = await requireOwnedEvent(deps.events, id, actorUserId);
      const patch = patchFromInput(input);

      assertDateOrder(patch.startsOn ?? existing.startsOn, patch.endsOn ?? existing.endsOn);

      const updated = await deps.events.update(id, patch);

      if (updated === undefined) {
        throw new AppError(errorCodes.internal, 500, { context: "event update" });
      }

      return toEvent(updated);
    },
  };
}

let defaultService: EventsService | undefined;

/** The singleton service wired to the pooled DB and the gateway client. */
export function getEventsService(): EventsService {
  defaultService ??= createEventsService({
    events: createEventsRepository(getDb()),
    gateway: gatewayAdminClient,
  });

  return defaultService;
}
