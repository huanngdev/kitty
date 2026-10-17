import { describe, expect, test } from "bun:test";
import {
  PAYOUT_BATCH_EVENT_TYPES,
  PAYOUT_ITEM_EVENT_TYPES,
  PaypalWebhookEventError,
  parsePaypalWebhookEvent,
} from "../src/payout-events";

/**
 * Fixtures are the shapes PayPal documents for Payouts webhooks
 * (docs/11-paypal-integration.md §3), trimmed to the fields Kitty models.
 */

function payoutItemEvent(eventType: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "WH-2WR32451HC0233532-67976317FL4543714",
    create_time: "2026-10-17T10:00:00Z",
    resource_type: "payouts_item",
    event_type: eventType,
    summary: "A successful payout was made",
    resource: {
      payout_item_id: "8PSHPDWXNM6JY",
      transaction_id: "1X1234567890",
      transaction_status: "SUCCESS",
      payout_batch_id: "5B1234567890",
      payout_item_fee: { currency: "USD", value: "0.25" },
      sender_item_id: "int_01JAYOUT0000000000000000",
      amount: { currency: "USD", value: "1.00" },
      receiver: "vendor@example.com",
      ...overrides,
    },
  };
}

function payoutBatchEvent(eventType: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "WH-3WR32451HC0233532-67976317FL4543715",
    create_time: "2026-10-17T10:00:00Z",
    resource_type: "payouts_batch",
    event_type: eventType,
    resource: {
      payout_batch_id: "5B1234567890",
      batch_status: "SUCCESS",
      sender_batch_header: { sender_batch_id: "int_01JAYOUT0000000000000000" },
      time_created: "2026-10-17T10:00:00Z",
      time_completed: "2026-10-17T10:00:05Z",
      ...overrides,
    },
  };
}

describe("parsePaypalWebhookEvent", () => {
  test("covers every documented payout item and batch event type", () => {
    for (const eventType of PAYOUT_ITEM_EVENT_TYPES) {
      expect(parsePaypalWebhookEvent(payoutItemEvent(eventType)).kind).toBe("payout_item");
    }

    for (const eventType of PAYOUT_BATCH_EVENT_TYPES) {
      expect(parsePaypalWebhookEvent(payoutBatchEvent(eventType)).kind).toBe("payout_batch");
    }
  });

  test("normalises a payout item event into cents and the intent lookup key", () => {
    const event = parsePaypalWebhookEvent(payoutItemEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"));

    expect(event).toEqual({
      kind: "payout_item",
      eventId: "WH-2WR32451HC0233532-67976317FL4543714",
      eventType: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      itemId: "8PSHPDWXNM6JY",
      itemStatus: "SUCCESS",
      senderItemId: "int_01JAYOUT0000000000000000",
      batchId: "5B1234567890",
      transactionId: "1X1234567890",
      amountCents: 100n,
      currency: "USD",
      raw: payoutItemEvent("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"),
    });
  });

  test("keeps the failure statuses distinguishable", () => {
    for (const status of ["FAILED", "RETURNED", "BLOCKED", "DENIED", "UNCLAIMED"]) {
      const event = parsePaypalWebhookEvent(
        payoutItemEvent("PAYMENT.PAYOUTS-ITEM.FAILED", { transaction_status: status }),
      );

      expect(event.kind === "payout_item" && event.itemStatus).toBe(status);
    }
  });

  test("normalises a payout item event whose item model is nested", () => {
    const payload = {
      id: "WH-NESTED-1",
      event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      resource_type: "payouts_item",
      resource: {
        payout_item_id: "8PSHPDWXNM6JY",
        transaction_status: "SUCCESS",
        payout_batch_id: "5B1234567890",
        payout_item: {
          amount: { currency: "USD", value: "1.00" },
          receiver: "vendor@example.com",
          sender_item_id: "int_02",
        },
      },
    };

    const event = parsePaypalWebhookEvent(payload);

    expect(event.kind === "payout_item" && event.senderItemId).toBe("int_02");
    expect(event.kind === "payout_item" && event.amountCents).toBe(100n);
    expect(event.kind === "payout_item" && event.currency).toBe("USD");
  });

  test("normalises a payout batch event", () => {
    const event = parsePaypalWebhookEvent(
      payoutBatchEvent("PAYMENT.PAYOUTSBATCH.DENIED", {
        batch_status: "DENIED",
      }),
    );

    expect(event).toEqual({
      kind: "payout_batch",
      eventId: "WH-3WR32451HC0233532-67976317FL4543715",
      eventType: "PAYMENT.PAYOUTSBATCH.DENIED",
      batchId: "5B1234567890",
      batchStatus: "DENIED",
      senderBatchId: "int_01JAYOUT0000000000000000",
      createdAt: "2026-10-17T10:00:00Z",
      raw: payoutBatchEvent("PAYMENT.PAYOUTSBATCH.DENIED", { batch_status: "DENIED" }),
    });
  });

  test("routes an event without a payout handler to the other bucket", () => {
    const event = parsePaypalWebhookEvent({
      id: "WH-INVOICE-1",
      event_type: "INVOICING.INVOICE.PAID",
      resource_type: "invoice",
      resource: { id: "INV2-XYZ", status: "PAID" },
    });

    expect(event).toEqual({
      kind: "other",
      eventId: "WH-INVOICE-1",
      eventType: "INVOICING.INVOICE.PAID",
      resourceId: "INV2-XYZ",
      raw: {
        id: "WH-INVOICE-1",
        event_type: "INVOICING.INVOICE.PAID",
        resource_type: "invoice",
        resource: { id: "INV2-XYZ", status: "PAID" },
      },
    });
  });

  test("flags a payout event whose resource does not match the documented shape", () => {
    const event = parsePaypalWebhookEvent({
      id: "WH-BROKEN-1",
      event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      resource_type: "payouts_item",
      resource: { unexpected: true },
    });

    expect(event.kind).toBe("malformed");
  });

  test("throws when the envelope has no usable event id", () => {
    expect(() => parsePaypalWebhookEvent({ event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" })).toThrow(
      PaypalWebhookEventError,
    );
  });
});
