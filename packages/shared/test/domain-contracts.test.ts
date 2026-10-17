import { describe, expect, test } from "bun:test";
import { idPrefixes, idSchema } from "../src/common/ids";
import { createEventSchema, eventSchema, putBudgetLinesSchema } from "../src/events";
import { createMemberSchema, memberEmailSchema } from "../src/members";
import { createVendorSchema, vendorSchema } from "../src/vendors";

/**
 * Contract tests for the `app` schema modules (docs/09 §2, docs/10 §4): the
 * shared schema is the source of truth for both `apps/api` and the web app, so
 * these pin the wire shapes and the money/email normalization rules.
 */

const eventId = `evt_${"0".repeat(25)}A`;

describe("events contracts", () => {
  test("createEventSchema fills defaults and keeps money as a decimal string", () => {
    const parsed = createEventSchema.parse({
      title: "Offsite",
      startsOn: "2026-12-01",
      endsOn: "2026-12-05",
      budget: "1000.00",
    });

    expect(parsed.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(parsed.currency).toBe("USD");
    expect(parsed.perMember).toBeNull();
    expect(parsed.description).toBeNull();
  });

  test("createEventSchema rejects float money", () => {
    const result = createEventSchema.safeParse({
      title: "Offsite",
      startsOn: "2026-12-01",
      endsOn: "2026-12-05",
      budget: 1000,
    });

    expect(result.success).toBe(false);
  });

  test("eventSchema requires an evt_ prefixed id", () => {
    const result = eventSchema.safeParse({
      id: "not-an-id",
      organizerId: "user_1",
      title: "Offsite",
      description: null,
      location: null,
      timezone: "UTC",
      startsOn: "2026-12-01",
      endsOn: "2026-12-05",
      currency: "USD",
      budget: "1000.00",
      perMember: null,
      status: "planning",
      kittyId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });

  test("putBudgetLinesSchema rejects duplicate categories", () => {
    const result = putBudgetLinesSchema.safeParse({
      lines: [
        { category: "food", planned: "1.00" },
        { category: "food", planned: "2.00" },
      ],
    });

    expect(result.success).toBe(false);
  });

  test("budget lines use the new bdl_ prefix", () => {
    expect(idPrefixes.budgetLine).toBe("bdl");
    expect(idSchema(idPrefixes.budgetLine).safeParse(`bdl_${"0".repeat(25)}A`).success).toBe(true);
  });
});

describe("members contracts", () => {
  test("createMemberSchema lowercases the email and defaults the share weight", () => {
    const parsed = createMemberSchema.parse({ name: "Mai", email: "Mai@Example.com" });

    expect(parsed.email).toBe("mai@example.com");
    expect(parsed.shareWeight).toBe(1);
    expect(parsed.slackHandle).toBeNull();
  });

  test("memberEmailSchema rejects a non-email", () => {
    expect(memberEmailSchema.safeParse("nope").success).toBe(false);
  });
});

describe("vendors contracts", () => {
  test("createVendorSchema lowercases the PayPal email", () => {
    const parsed = createVendorSchema.parse({
      name: "Homestay",
      paypalEmail: "Homestay@Vendor.example",
      category: "lodging",
    });

    expect(parsed.paypalEmail).toBe("homestay@vendor.example");
    expect(parsed.quote).toBeNull();
  });

  test("vendorSchema requires the verified flag", () => {
    const result = vendorSchema.safeParse({
      id: `ven_${"0".repeat(25)}A`,
      eventId,
      name: "Homestay",
      paypalEmail: "homestay@vendor.example",
      category: "lodging",
      quote: null,
      notes: null,
    });

    expect(result.success).toBe(false);
  });
});
