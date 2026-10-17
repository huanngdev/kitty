import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { budgetLineListResponseSchema } from "@kitty/shared/events";
import { Hono } from "hono";
import { handleError } from "../../app";
import { type AppEnv, requireSession } from "../../middleware/session";
import {
  EVENT_ID,
  ORG_USER_ID,
  createFakeBudgetLinesRepository,
  createFakeEventsRepository,
  makeEventRow,
} from "../test-support/fakes";
import { fakeSession, makeTestUser } from "../test-support/session";
import { createBudgetLinesRoutes } from "./budget-lines.routes";
import { createBudgetLinesService } from "./budget-lines.service";

function buildApp(signedIn = true) {
  const events = createFakeEventsRepository([makeEventRow()]);
  const budgetLines = createFakeBudgetLinesRepository();
  const service = createBudgetLinesService({ events: events.repo, budgetLines: budgetLines.repo });
  const app = new Hono<AppEnv>()
    .onError(handleError)
    .use("*", fakeSession(signedIn ? makeTestUser({ id: ORG_USER_ID }) : null), requireSession)
    .route(
      "/events",
      createBudgetLinesRoutes(() => service),
    );

  return { app };
}

describe("PUT/GET /events/:id/budget-lines", () => {
  test("replaces the set and reads it back", async () => {
    const { app } = buildApp();

    const put = await app.request(`/events/${EVENT_ID}/budget-lines`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines: [{ category: "lodging", planned: "800.00" }] }),
    });

    expect(put.status).toBe(200);
    expect(budgetLineListResponseSchema.parse(await put.json()).items).toHaveLength(1);

    const get = await app.request(`/events/${EVENT_ID}/budget-lines`);

    expect(budgetLineListResponseSchema.parse(await get.json()).items).toEqual([
      expect.objectContaining({ category: "lodging", planned: "800.00" }),
    ]);
  });

  test("rejects duplicate categories with 400", async () => {
    const { app } = buildApp();

    const response = await app.request(`/events/${EVENT_ID}/budget-lines`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lines: [
          { category: "food", planned: "1.00" },
          { category: "food", planned: "2.00" },
        ],
      }),
    });

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("VALIDATION_FAILED");
  });

  test("returns 401 without a session", async () => {
    const { app } = buildApp(false);

    const response = await app.request(`/events/${EVENT_ID}/budget-lines`);

    expect(response.status).toBe(401);
  });
});
