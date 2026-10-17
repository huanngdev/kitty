import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import {
  buildClient,
  PAYPAL_BASE,
  server,
  tokenHandler,
  usePayPalServer,
} from "./test-support/server";

usePayPalServer();

const PAYOUTS_URL = `${PAYPAL_BASE}/v1/payments/payouts`;

describe("payouts.createSingle", () => {
  test("builds a 1-item batch and returns the batch header", async () => {
    let captured: unknown;
    const requestIds: (string | null)[] = [];
    server.use(
      tokenHandler(),
      http.post(PAYOUTS_URL, async ({ request }) => {
        captured = await request.json();
        requestIds.push(request.headers.get("paypal-request-id"));

        return HttpResponse.json({
          batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" },
        });
      }),
    );

    const result = await buildClient().payouts.createSingle({
      requestId: "int_01PAYOUT",
      senderBatchId: "int_01PAYOUT",
      payeeEmail: "homestay@example.com",
      amountCents: 120000n,
      currency: "USD",
      note: "Deposit 30%",
    });

    expect(result).toEqual({ batchId: "BATCH-1", status: "PENDING" });
    expect(requestIds).toEqual(["int_01PAYOUT"]);
    expect(captured).toEqual({
      sender_batch_header: {
        sender_batch_id: "int_01PAYOUT",
        email_subject: "Payment from Kitty",
        email_message: "Deposit 30%",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: "1200.00", currency: "USD" },
          receiver: "homestay@example.com",
          note: "Deposit 30%",
          sender_item_id: "int_01PAYOUT",
        },
      ],
    });
  });

  test("uses senderItemId as the item lookup key when it differs from the batch id", async () => {
    let captured: unknown;
    server.use(
      tokenHandler(),
      http.post(PAYOUTS_URL, async ({ request }) => {
        captured = await request.json();

        return HttpResponse.json({
          batch_header: { payout_batch_id: "BATCH-3", batch_status: "PENDING" },
        });
      }),
    );

    await buildClient().payouts.createSingle({
      requestId: "int_03",
      senderBatchId: "batch_03",
      senderItemId: "int_03",
      payeeEmail: "vendor@example.com",
      amountCents: 100n,
      currency: "USD",
      note: "note",
    });

    // `PAYMENT.PAYOUTS-ITEM.*` webhooks are matched back to the intent through
    // `sender_item_id` (docs/11 §3), so it must carry the intent id.
    expect(captured).toEqual({
      sender_batch_header: {
        sender_batch_id: "batch_03",
        email_subject: "Payment from Kitty",
        email_message: "note",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: "1.00", currency: "USD" },
          receiver: "vendor@example.com",
          note: "note",
          sender_item_id: "int_03",
        },
      ],
    });
  });

  test("honours custom subject and message", async () => {
    let captured: unknown;
    server.use(
      tokenHandler(),
      http.post(PAYOUTS_URL, async ({ request }) => {
        captured = await request.json();

        return HttpResponse.json({
          batch_header: { payout_batch_id: "BATCH-2", batch_status: "PENDING" },
        });
      }),
    );

    await buildClient().payouts.createSingle({
      requestId: "int_02",
      senderBatchId: "int_02",
      payeeEmail: "vendor@example.com",
      amountCents: 500n,
      currency: "USD",
      note: "note",
      emailSubject: "Kitty payment",
      emailMessage: "Thanks!",
    });

    expect(captured).toEqual({
      sender_batch_header: {
        sender_batch_id: "int_02",
        email_subject: "Kitty payment",
        email_message: "Thanks!",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: "5.00", currency: "USD" },
          receiver: "vendor@example.com",
          note: "note",
          sender_item_id: "int_02",
        },
      ],
    });
  });
});

describe("payouts.getBatch", () => {
  test("maps header and nested payout_item amounts to cents", async () => {
    server.use(
      tokenHandler(),
      http.get(`${PAYOUTS_URL}/BATCH-1`, () =>
        HttpResponse.json({
          batch_header: {
            payout_batch_id: "BATCH-1",
            batch_status: "SUCCESS",
            sender_batch_id: "int_01PAYOUT",
            time_created: "2026-10-17T10:00:00Z",
          },
          items: [
            {
              payout_item_id: "ITEM-1",
              transaction_status: "SUCCESS",
              payout_batch_id: "BATCH-1",
              payout_item_fee: { currency: "USD", value: "0.25" },
              // PayPal nests the item model: `sender_item_id` and `amount` live
              // inside it, not on the item (confirmed against the sandbox).
              payout_item: {
                recipient_type: "EMAIL",
                amount: { currency: "USD", value: "1200.00" },
                note: "Deposit 30%",
                receiver: "homestay@example.com",
                sender_item_id: "int_01PAYOUT",
              },
            },
          ],
        }),
      ),
    );

    const batch = await buildClient().payouts.getBatch({ batchId: "BATCH-1" });

    expect(batch).toEqual({
      batchId: "BATCH-1",
      senderBatchId: "int_01PAYOUT",
      status: "SUCCESS",
      createdAt: "2026-10-17T10:00:00Z",
      items: [
        {
          itemId: "ITEM-1",
          status: "SUCCESS",
          batchId: "BATCH-1",
          senderItemId: "int_01PAYOUT",
          amountCents: 120000n,
          currency: "USD",
        },
      ],
    });
  });

  test("still reads a flat item shape", async () => {
    server.use(
      tokenHandler(),
      http.get(`${PAYOUTS_URL}/BATCH-FLAT`, () =>
        HttpResponse.json({
          items: [
            {
              payout_item_id: "ITEM-2",
              transaction_status: "FAILED",
              sender_item_id: "int_02",
              amount: { currency_code: "USD", value: "5.00" },
            },
          ],
        }),
      ),
    );

    const batch = await buildClient().payouts.getBatch({ batchId: "BATCH-FLAT" });

    expect(batch.items).toEqual([
      {
        itemId: "ITEM-2",
        status: "FAILED",
        batchId: undefined,
        senderItemId: "int_02",
        amountCents: 500n,
        currency: "USD",
      },
    ]);
  });

  test("tolerates a batch without header or items", async () => {
    server.use(
      tokenHandler(),
      http.get(`${PAYOUTS_URL}/BATCH-2`, () => HttpResponse.json({})),
    );

    const batch = await buildClient().payouts.getBatch({ batchId: "BATCH-2" });

    expect(batch).toEqual({
      batchId: undefined,
      senderBatchId: undefined,
      status: undefined,
      createdAt: undefined,
      items: [],
    });
  });
});

describe("payouts.getItem", () => {
  test("maps a single payout item", async () => {
    server.use(
      tokenHandler(),
      http.get(`${PAYPAL_BASE}/v1/payments/payouts-item/ITEM-1`, () =>
        HttpResponse.json({
          payout_item_id: "ITEM-1",
          transaction_status: "UNCLAIMED",
          payout_item: {
            amount: { currency: "USD", value: "12.34" },
            sender_item_id: "int_01",
          },
        }),
      ),
    );

    const item = await buildClient().payouts.getItem({ itemId: "ITEM-1" });

    expect(item).toEqual({
      itemId: "ITEM-1",
      status: "UNCLAIMED",
      batchId: undefined,
      senderItemId: "int_01",
      amountCents: 1234n,
      currency: "USD",
    });
  });
});
