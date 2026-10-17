import { describe, expect, test } from "bun:test";
import { createMemberSchema } from "@kitty/shared/members";
import { AppError } from "../../lib/errors";
import {
  EVENT_ID,
  ORG_USER_ID,
  createFakeEventsRepository,
  createFakeMembersRepository,
  makeEventRow,
  makeMemberRow,
} from "../test-support/fakes";
import { createMembersService } from "./members.service";

function deps(seedEvents = [makeEventRow()]) {
  const events = createFakeEventsRepository(seedEvents);
  const members = createFakeMembersRepository();

  return {
    events,
    members,
    service: createMembersService({ events: events.repo, members: members.repo }),
  };
}

async function captureError(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }

    throw error;
  }

  throw new Error("expected an AppError");
}

describe("membersService.create", () => {
  test("generates a prefixed id and a portal token", async () => {
    const { members, service } = deps();

    const member = await service.create(
      EVENT_ID,
      createMemberSchema.parse({ name: "Mai", email: "Mai@Example.com" }),
      ORG_USER_ID,
    );

    expect(member.id).toMatch(/^mem_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(member.email).toBe("mai@example.com");
    expect(member.memberToken.length).toBeGreaterThanOrEqual(40);
    expect(members.rows.size).toBe(1);
  });

  test("rejects a duplicate email within the event with 409", async () => {
    const { members, service } = deps();
    members.rows.set("mem_01JZ0000000000000000000000", makeMemberRow({ email: "mai@example.com" }));

    const error = await captureError(() =>
      service.create(
        EVENT_ID,
        createMemberSchema.parse({ name: "Mai", email: "mai@example.com" }),
        ORG_USER_ID,
      ),
    );

    expect(error.code).toBe("MEMBER_EMAIL_EXISTS");
    expect(error.httpStatus).toBe(409);
  });

  test("requires the organizer (403) and a known event (404)", async () => {
    const { service } = deps();

    const forbidden = await captureError(() =>
      service.create(
        EVENT_ID,
        createMemberSchema.parse({ name: "Mai", email: "m@x.com" }),
        "user_other",
      ),
    );
    const missing = await captureError(() =>
      service.create(
        "evt_01JZ0000000000000000000099",
        createMemberSchema.parse({ name: "Mai", email: "m@x.com" }),
        ORG_USER_ID,
      ),
    );

    expect(forbidden.code).toBe("FORBIDDEN");
    expect(missing.code).toBe("EVENT_NOT_FOUND");
  });
});

describe("membersService.list/remove", () => {
  test("lists members of the event and removes one", async () => {
    const { members, service } = deps();
    members.rows.set("mem_01JZ0000000000000000000000", makeMemberRow());

    expect(await service.list(EVENT_ID, ORG_USER_ID)).toHaveLength(1);

    const removed = await service.remove(EVENT_ID, "mem_01JZ0000000000000000000000", ORG_USER_ID);

    expect(removed).toEqual({ id: "mem_01JZ0000000000000000000000" });
    expect(members.rows.size).toBe(0);
  });

  test("remove returns 404 for an unknown member", async () => {
    const { service } = deps();

    const error = await captureError(() =>
      service.remove(EVENT_ID, "mem_01JZ0000000000000000000099", ORG_USER_ID),
    );

    expect(error.code).toBe("MEMBER_NOT_FOUND");
    expect(error.httpStatus).toBe(404);
  });
});
