import { describe, expect, test } from "bun:test";
import { apiErrorSchema } from "@kitty/shared";
import { vendorDetailResponseSchema, vendorListResponseSchema } from "@kitty/shared/vendors";
import { Hono } from "hono";
import { handleError } from "../../../src/app";
import { type AppEnv, requireSession } from "../../../src/middleware/session";
import {
  EVENT_ID,
  ORG_USER_ID,
  createFakeEventsRepository,
  createFakeGateway,
  createFakeVendorsRepository,
  makeEventRow,
} from "../../support/fakes";
import { fakeSession, makeTestUser } from "../../support/session";
import { createVendorsRoutes } from "../../../src/modules/vendors/vendors.routes";
import { createVendorsService } from "../../../src/modules/vendors/vendors.service";

const KITTY_ID = "kty_01JZ0000000000000000000000";

function buildApp(signedIn = true) {
  const events = createFakeEventsRepository([makeEventRow({ kittyId: KITTY_ID })]);
  const vendors = createFakeVendorsRepository();
  const gateway = createFakeGateway();
  const service = createVendorsService({ events: events.repo, vendors: vendors.repo, gateway });
  const app = new Hono<AppEnv>()
    .onError(handleError)
    .use("*", fakeSession(signedIn ? makeTestUser({ id: ORG_USER_ID }) : null), requireSession)
    .route(
      "/events",
      createVendorsRoutes(() => service),
    );

  return { app, gateway };
}

const createBody = JSON.stringify({
  name: "Homestay",
  paypalEmail: "homestay@vendor.example",
  category: "lodging",
});

describe("POST/GET/PATCH /events/:id/vendors", () => {
  test("creates an unverified vendor and lists it", async () => {
    const { app } = buildApp();

    const created = await app.request(`/events/${EVENT_ID}/vendors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: createBody,
    });

    expect(created.status).toBe(201);
    expect(vendorDetailResponseSchema.parse(await created.json()).verified).toBe(false);

    const list = await app.request(`/events/${EVENT_ID}/vendors`);

    expect(vendorListResponseSchema.parse(await list.json()).items).toHaveLength(1);
  });

  test("returns 401 without a session", async () => {
    const { app } = buildApp(false);

    const response = await app.request(`/events/${EVENT_ID}/vendors`);

    expect(response.status).toBe(401);
  });
});

describe("POST /events/:id/vendors/:vendorId/verify", () => {
  test("verifies the vendor and registers the gateway payee", async () => {
    const { app, gateway } = buildApp();
    const vendor = vendorDetailResponseSchema.parse(
      await (
        await app.request(`/events/${EVENT_ID}/vendors`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: createBody,
        })
      ).json(),
    );

    const response = await app.request(`/events/${EVENT_ID}/vendors/${vendor.id}/verify`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(vendorDetailResponseSchema.parse(await response.json()).verified).toBe(true);
    expect(gateway.verifiedPayees).toEqual([
      { kittyId: KITTY_ID, email: "homestay@vendor.example" },
    ]);
  });

  test("returns 404 for an unknown vendor", async () => {
    const { app } = buildApp();

    const response = await app.request(
      `/events/${EVENT_ID}/vendors/ven_01JZ0000000000000000000099/verify`,
      { method: "POST" },
    );

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("VENDOR_NOT_FOUND");
  });
});
