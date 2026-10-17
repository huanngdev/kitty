import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { Hono } from "hono";
import { handleError } from "../../src/app";
import { createRequireEventOrganizer, type EventLookup } from "../../src/middleware/authorization";
import { type AppEnv, requireSession } from "../../src/middleware/session";
import { EVENT_ID, ORG_USER_ID, makeEventRow } from "../support/fakes";
import { fakeSession, makeTestUser } from "../support/session";

function lookup(rows: ReturnType<typeof makeEventRow>[]): EventLookup {
  return {
    findById: async (id) => rows.find((row) => row.id === id),
  };
}

function buildApp(input: { signedIn: boolean; rows: ReturnType<typeof makeEventRow>[] }) {
  const requireOrganizer = createRequireEventOrganizer({ events: lookup(input.rows) });
  const app = new Hono<AppEnv>()
    .onError(handleError)
    .use(
      "*",
      fakeSession(input.signedIn ? makeTestUser({ id: ORG_USER_ID }) : null),
      requireSession,
    );

  return app
    .get("/events/:id", requireOrganizer, (c) => c.json({ id: c.get("event")?.id ?? null }))
    .get("/events/:id/members", requireOrganizer, (c) => c.json({ ok: true }));
}

describe("requireEventOrganizer", () => {
  test("lets the organizer through and exposes the event on the context", async () => {
    const app = buildApp({ signedIn: true, rows: [makeEventRow()] });

    const response = await app.request(`/events/${EVENT_ID}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: EVENT_ID });
  });

  test("answers 404 for an unknown id", async () => {
    const app = buildApp({ signedIn: true, rows: [] });

    const response = await app.request("/events/evt_01JZ0000000000000000000000");
    const parsed = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(404);
    expect(parsed.error.code).toBe("EVENT_NOT_FOUND");
  });

  test("answers 404 (not 403) for somebody else's event", async () => {
    const app = buildApp({
      signedIn: true,
      rows: [makeEventRow({ organizerId: "user_somebody_else" })],
    });

    const response = await app.request(`/events/${EVENT_ID}`);
    const parsed = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(404);
    expect(parsed.error.code).toBe("EVENT_NOT_FOUND");
  });

  test("guards nested routes too", async () => {
    const app = buildApp({
      signedIn: true,
      rows: [makeEventRow({ organizerId: "user_somebody_else" })],
    });

    const response = await app.request(`/events/${EVENT_ID}/members`);

    expect(response.status).toBe(404);
  });

  test("answers 401 before touching ownership when signed out", async () => {
    const app = buildApp({ signedIn: false, rows: [makeEventRow()] });

    const response = await app.request(`/events/${EVENT_ID}`);

    expect(response.status).toBe(401);
  });
});
