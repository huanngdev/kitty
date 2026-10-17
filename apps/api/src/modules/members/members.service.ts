import type { MemberRow } from "@kitty/db";
import { errorCodes, idPrefixes, newId } from "@kitty/shared";
import { type CreateMemberInput, type Member } from "@kitty/shared/members";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { newMemberToken } from "../../lib/tokens";
import { requireOwnedEvent } from "../events/events.ownership";
import { type EventsRepository, createEventsRepository } from "../events/events.repository";
import { type MembersRepository, createMembersRepository } from "./members.repository";

/**
 * Member service (docs/10-api-spec.md §4). Members belong to one event; only the
 * organizer of that event can add or remove them.
 */

/** Maps a DB row to the wire contract. */
export function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    email: row.email,
    shareWeight: row.shareWeight,
    memberToken: row.memberToken,
    slackHandle: row.slackHandle,
  };
}

export interface MembersService {
  create(eventId: string, input: CreateMemberInput, actorUserId: string): Promise<Member>;
  list(eventId: string, actorUserId: string): Promise<Member[]>;
  remove(eventId: string, memberId: string, actorUserId: string): Promise<{ id: string }>;
}

export interface MembersServiceDeps {
  readonly events: EventsRepository;
  readonly members: MembersRepository;
}

export function createMembersService(deps: MembersServiceDeps): MembersService {
  return {
    async create(eventId, input, actorUserId) {
      await requireOwnedEvent(deps.events, eventId, actorUserId);

      const existing = await deps.members.findByEventAndEmail(eventId, input.email);

      if (existing !== undefined) {
        throw new AppError(errorCodes.memberEmailExists, 409, { email: input.email });
      }

      const row = await deps.members.insert({
        id: newId(idPrefixes.member),
        eventId,
        name: input.name,
        email: input.email,
        shareWeight: input.shareWeight,
        memberToken: newMemberToken(),
        slackHandle: input.slackHandle,
      });

      return toMember(row);
    },

    async list(eventId, actorUserId) {
      await requireOwnedEvent(deps.events, eventId, actorUserId);

      const rows = await deps.members.listByEvent(eventId);

      return rows.map(toMember);
    },

    async remove(eventId, memberId, actorUserId) {
      await requireOwnedEvent(deps.events, eventId, actorUserId);

      const removed = await deps.members.deleteByIdForEvent(eventId, memberId);

      if (removed === 0) {
        throw new AppError(errorCodes.memberNotFound, 404, { memberId });
      }

      return { id: memberId };
    },
  };
}

let defaultService: MembersService | undefined;

/** The singleton service wired to the pooled DB. */
export function getMembersService(): MembersService {
  defaultService ??= createMembersService({
    events: createEventsRepository(getDb()),
    members: createMembersRepository(getDb()),
  });

  return defaultService;
}
