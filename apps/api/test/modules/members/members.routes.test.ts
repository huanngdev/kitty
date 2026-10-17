import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { memberDetailResponseSchema, memberListResponseSchema } from "@kitty/shared/members";
import { Hono } from "hono";
import { handleError } from "../../../src/app";
import { type AppEnv, requireSession } from "../../../src/middleware/session";
import {
  EVENT_ID,
  ORG_USER_ID,
  createFakeEventsRepository,
  createFakeMembersRepository,
  makeEventRow,
} from "../../support/fakes";
import { fakeSession, makeTestUser } from "../../support/session";
import { createMembersRoutes } from "../../../src/modules/members/members.routes";
import { createMembersService } from "../../../src/modules/members/members.service";

function buildApp(signedIn = true) {
  const events = createFakeEventsRepository([makeEventRow()]);
  const members = createFakeMembersRepository();
  const service = createMembersService({ events: events.repo, members: members.repo });
  const app = new Hono<AppEnv>()
    .onError(handleError)
    .use("*", fakeSession(signedIn ? makeTestUser({ id: ORG_USER_ID }) : null), requireSession)
    .route(
      "/events",
      createMembersRoutes(() => service),
    );

  return { app };
}

const createBody = JSON.stringify({ name: "Mai", email: "mai@example.com" });

describe("POST/GET /events/:id/members", () => {
  test("adds a member and lists it", async () => {
    const { app } = buildApp();

    const created = await app.request(`/events/${EVENT_ID}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody,
    });

    expect(created.status).toBe(201);
    const member = memberDetailResponseSchema.parse(await created.json());
    expect(member.memberToken.length).toBeGreaterThanOrEqual(40);

    const list = await app.request(`/events/${EVENT_ID}/members`);

    expect(list.status).toBe(200);
    expect(memberListResponseSchema.parse(await list.json()).items).toHaveLength(1);
  });

  test("returns 409 for a duplicate email", async () => {
    const { app } = buildApp();

    await app.request(`/events/${EVENT_ID}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody,
    });
    const response = await app.request(`/events/${EVENT_ID}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody,
    });

    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("MEMBER_EMAIL_EXISTS");
  });

  test("returns 401 without a session", async () => {
    const { app } = buildApp(false);

    const response = await app.request(`/events/${EVENT_ID}/members`);

    expect(response.status).toBe(401);
  });
});

describe("DELETE /events/:id/members/:memberId", () => {
  test("removes a member and 404s the second time", async () => {
    const { app } = buildApp();
    const created = memberDetailResponseSchema.parse(
      await (
        await app.request(`/events/${EVENT_ID}/members`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: createBody,
        })
      ).json(),
    );

    const removed = await app.request(`/events/${EVENT_ID}/members/${created.id}`, {
      method: "DELETE",
    });
    const again = await app.request(`/events/${EVENT_ID}/members/${created.id}`, {
      method: "DELETE",
    });

    expect(removed.status).toBe(200);
    expect(again.status).toBe(404);
    expect(apiErrorSchema.parse(await again.json()).error.code).toBe("MEMBER_NOT_FOUND");
  });
});
