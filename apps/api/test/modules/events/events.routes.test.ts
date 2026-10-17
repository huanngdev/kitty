import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { eventDetailResponseSchema, eventListResponseSchema } from "@kitty/shared/events";
import { Hono } from "hono";
import { handleError } from "../../../src/app";
import { type AppEnv, requireSession } from "../../../src/middleware/session";
import { ORG_USER_ID, createFakeEventsRepository, createFakeGateway } from "../../support/fakes";
import { fakeSession, makeTestUser } from "../../support/session";
import { createEventsRoutes } from "../../../src/modules/events/events.routes";
import { createEventsService } from "../../../src/modules/events/events.service";

function buildApp(signedIn = true) {
  const events = createFakeEventsRepository();
  const gateway = createFakeGateway();
  const service = createEventsService({ events: events.repo, gateway });
  const app = new Hono<AppEnv>()
    .onError(handleError)
    .use("*", fakeSession(signedIn ? makeTestUser({ id: ORG_USER_ID }) : null), requireSession)
    .route(
      "/events",
      createEventsRoutes(() => service),
    );

  return { app, events, gateway };
}

const createBody = JSON.stringify({
  title: "Team offsite",
  startsOn: "2026-12-01",
  endsOn: "2026-12-05",
  budget: "1000.00",
});

describe("POST /events", () => {
  test("creates an event and its gateway kitty", async () => {
    const { app, gateway } = buildApp();

    const response = await app.request("/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody,
    });

    expect(response.status).toBe(201);
    const event = eventDetailResponseSchema.parse(await response.json());
    expect(event.kittyId).toBe("kty_01JZ0000000000000000000000");
    expect(event.budget).toBe("1000.00");
    expect(gateway.createdKitties).toHaveLength(1);
  });

  test("returns 401 without a session", async () => {
    const { app } = buildApp(false);

    const response = await app.request("/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody,
    });

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("returns 400 for an invalid body", async () => {
    const { app } = buildApp();

    const response = await app.request("/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "no budget" }),
    });

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("VALIDATION_FAILED");
  });
});

describe("GET /events", () => {
  test("lists the session user's events", async () => {
    const { app } = buildApp();

    await app.request("/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody,
    });

    const response = await app.request("/events");

    expect(response.status).toBe(200);
    expect(eventListResponseSchema.parse(await response.json()).items).toHaveLength(1);
  });
});

describe("GET/PATCH /events/:id", () => {
  test("returns 404 for an unknown event", async () => {
    const { app } = buildApp();

    const response = await app.request("/events/evt_01JZ0000000000000000000099");

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("EVENT_NOT_FOUND");
  });

  test("patches the budget of an existing event", async () => {
    const { app } = buildApp();
    const created = eventDetailResponseSchema.parse(
      await (
        await app.request("/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: createBody,
        })
      ).json(),
    );

    const response = await app.request(`/events/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ budget: "2000.00" }),
    });

    expect(response.status).toBe(200);
    expect(eventDetailResponseSchema.parse(await response.json()).budget).toBe("2000.00");
  });

  test("rejects a malformed id with 400", async () => {
    const { app } = buildApp();

    const response = await app.request("/events/not-an-id");

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("VALIDATION_FAILED");
  });
});
