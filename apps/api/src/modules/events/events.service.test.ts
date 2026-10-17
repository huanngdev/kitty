import { describe, expect, test } from "bun:test";
import { createEventSchema } from "@kitty/shared/events";
import { AppError } from "../../lib/errors";
import {
  EVENT_ID,
  ORG_USER_ID,
  createFakeEventsRepository,
  createFakeGateway,
  makeEventRow,
} from "../test-support/fakes";
import { createEventsService } from "./events.service";

function validInput(overrides: Record<string, unknown> = {}) {
  return createEventSchema.parse({
    title: "Team offsite",
    startsOn: "2026-12-01",
    endsOn: "2026-12-05",
    budget: "1000.00",
    ...overrides,
  });
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

describe("eventsService.create", () => {
  test("inserts the event, creates the kitty and returns the wire contract", async () => {
    const events = createFakeEventsRepository();
    const gateway = createFakeGateway({ kittyId: "kty_01JZ0000000000000000000000" });
    const service = createEventsService({ events: events.repo, gateway });

    const event = await service.create(validInput({ perMember: "250.00" }), ORG_USER_ID);

    expect(event.organizerId).toBe(ORG_USER_ID);
    expect(event.budget).toBe("1000.00");
    expect(event.perMember).toBe("250.00");
    expect(event.status).toBe("planning");
    expect(event.kittyId).toBe("kty_01JZ0000000000000000000000");
    expect(events.rows.size).toBe(1);
    expect(gateway.createdKitties).toEqual([{ userId: ORG_USER_ID, eventId: event.id }]);
  });

  test("deletes the event when the gateway kitty creation fails (compensating flow)", async () => {
    const events = createFakeEventsRepository();
    const gateway = createFakeGateway({ failCreateKitty: true });
    const service = createEventsService({ events: events.repo, gateway });

    await expect(service.create(validInput(), ORG_USER_ID)).rejects.toThrow("gateway unavailable");

    expect(events.rows.size).toBe(0);
    expect(gateway.createdKitties).toHaveLength(0);
  });

  test("rejects an endsOn before startsOn", async () => {
    const events = createFakeEventsRepository();
    const service = createEventsService({ events: events.repo, gateway: createFakeGateway() });

    const error = await captureError(() =>
      service.create(validInput({ endsOn: "2026-11-30" }), ORG_USER_ID),
    );

    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.httpStatus).toBe(400);
    expect(events.rows.size).toBe(0);
  });
});

describe("eventsService.list/get/update", () => {
  test("list only returns the organizer's events", async () => {
    const mine = makeEventRow({ id: EVENT_ID });
    const theirs = makeEventRow({
      id: "evt_01JZ0000000000000000000001",
      organizerId: "user_other",
    });
    const events = createFakeEventsRepository([mine, theirs]);
    const service = createEventsService({ events: events.repo, gateway: createFakeGateway() });

    const list = await service.list(ORG_USER_ID);

    expect(list.map((event) => event.id)).toEqual([EVENT_ID]);
  });

  test("get returns 404 for an unknown event and 403 for someone else's", async () => {
    const events = createFakeEventsRepository([makeEventRow()]);
    const service = createEventsService({ events: events.repo, gateway: createFakeGateway() });

    const missing = await captureError(() =>
      service.get("evt_01JZ0000000000000000000099", ORG_USER_ID),
    );
    const forbidden = await captureError(() => service.get(EVENT_ID, "user_other"));

    expect(missing.code).toBe("EVENT_NOT_FOUND");
    expect(missing.httpStatus).toBe(404);
    expect(forbidden.code).toBe("FORBIDDEN");
    expect(forbidden.httpStatus).toBe(403);
  });

  test("update rewrites money and status", async () => {
    const events = createFakeEventsRepository([makeEventRow()]);
    const service = createEventsService({ events: events.repo, gateway: createFakeGateway() });

    const updated = await service.update(
      EVENT_ID,
      { budget: "1234.56", status: "active" },
      ORG_USER_ID,
    );

    expect(updated.budget).toBe("1234.56");
    expect(updated.status).toBe("active");
  });
});
