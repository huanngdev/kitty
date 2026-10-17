import { describe, expect, test } from "bun:test";
import { createVendorSchema } from "@kitty/shared/vendors";
import { AppError } from "../../../src/lib/errors";
import {
  EVENT_ID,
  ORG_USER_ID,
  createFakeEventsRepository,
  createFakeGateway,
  createFakeVendorsRepository,
  makeEventRow,
  makeVendorRow,
} from "../../support/fakes";
import { createVendorsService } from "../../../src/modules/vendors/vendors.service";

const KITTY_ID = "kty_01JZ0000000000000000000000";

function deps(eventOverrides: Parameters<typeof makeEventRow>[0] = {}) {
  const events = createFakeEventsRepository([
    makeEventRow({ kittyId: KITTY_ID, ...eventOverrides }),
  ]);
  const vendors = createFakeVendorsRepository();
  const gateway = createFakeGateway();

  return {
    events,
    vendors,
    gateway,
    service: createVendorsService({ events: events.repo, vendors: vendors.repo, gateway }),
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

describe("vendorsService.create", () => {
  test("creates an unverified vendor with a parsed quote", async () => {
    const { service } = deps();

    const vendor = await service.create(
      EVENT_ID,
      createVendorSchema.parse({
        name: "Homestay",
        paypalEmail: "Homestay@Vendor.example",
        category: "lodging",
        quote: "1200.00",
      }),
      ORG_USER_ID,
    );

    expect(vendor.id).toMatch(/^ven_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(vendor.paypalEmail).toBe("homestay@vendor.example");
    expect(vendor.quote).toBe("1200.00");
    expect(vendor.verified).toBe(false);
  });
});

describe("vendorsService.verify", () => {
  test("registers the gateway payee and flips verified", async () => {
    const { service, gateway, vendors } = deps();
    vendors.rows.set("ven_01JZ0000000000000000000000", makeVendorRow());

    const vendor = await service.verify(EVENT_ID, "ven_01JZ0000000000000000000000", ORG_USER_ID);

    expect(vendor.verified).toBe(true);
    expect(gateway.verifiedPayees).toEqual([
      { kittyId: KITTY_ID, email: "homestay@vendor.example" },
    ]);
  });

  test("leaves the vendor unverified when the gateway call fails", async () => {
    const events = createFakeEventsRepository([makeEventRow({ kittyId: KITTY_ID })]);
    const vendors = createFakeVendorsRepository([makeVendorRow()]);
    const gateway = createFakeGateway({ failVerifyPayee: true });
    const service = createVendorsService({
      events: events.repo,
      vendors: vendors.repo,
      gateway,
    });

    await expect(
      service.verify(EVENT_ID, "ven_01JZ0000000000000000000000", ORG_USER_ID),
    ).rejects.toThrow("gateway unavailable");

    expect(vendors.rows.get("ven_01JZ0000000000000000000000")?.verified).toBe(false);
  });

  test("requires the event to have a kitty", async () => {
    const { service, vendors } = deps({ kittyId: null });
    vendors.rows.set("ven_01JZ0000000000000000000000", makeVendorRow());

    const error = await captureError(() =>
      service.verify(EVENT_ID, "ven_01JZ0000000000000000000000", ORG_USER_ID),
    );

    expect(error.code).toBe("EVENT_HAS_NO_KITTY");
    expect(error.httpStatus).toBe(409);
  });

  test("returns 404 for an unknown vendor", async () => {
    const { service } = deps();

    const error = await captureError(() =>
      service.verify(EVENT_ID, "ven_01JZ0000000000000000000099", ORG_USER_ID),
    );

    expect(error.code).toBe("VENDOR_NOT_FOUND");
  });
});

describe("vendorsService.update", () => {
  test("changing the PayPal email re-arms verification", async () => {
    const { service, vendors } = deps();
    vendors.rows.set("ven_01JZ0000000000000000000000", makeVendorRow({ verified: true }));

    const vendor = await service.update(
      EVENT_ID,
      "ven_01JZ0000000000000000000000",
      { paypalEmail: "new@vendor.example" },
      ORG_USER_ID,
    );

    expect(vendor.paypalEmail).toBe("new@vendor.example");
    expect(vendor.verified).toBe(false);
  });
});
