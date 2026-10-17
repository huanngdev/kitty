import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import { createPayPalClient } from "./client";
import { backoffMs } from "./http";
import {
  buildClient,
  PAYPAL_BASE,
  server,
  TEST_CLIENT_ID,
  TEST_CLIENT_SECRET,
  tokenHandler,
  usePayPalServer,
} from "./test-support/server";

usePayPalServer();

const ORDER_URL = `${PAYPAL_BASE}/v2/checkout/orders/ORDER-1`;
const PAYOUT_URL = `${PAYPAL_BASE}/v1/payments/payouts`;

function completedOrder(): Response {
  return HttpResponse.json({ id: "ORDER-1", status: "COMPLETED" });
}

function payoutBody(): Response {
  return HttpResponse.json({
    batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" },
  });
}

describe("backoffMs", () => {
  test("grows exponentially and adds jitter", () => {
    expect(backoffMs(1, () => 0)).toBe(250);
    expect(backoffMs(1, () => 0.999)).toBe(499);
    expect(backoffMs(2, () => 0)).toBe(500);
    expect(backoffMs(3, () => 0)).toBe(1000);
    // Attempt indices below 1 clamp to the first step.
    expect(backoffMs(0, () => 0)).toBe(250);
  });
});

describe("retry matrix", () => {
  test("retries a network error, then succeeds", async () => {
    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        calls += 1;

        return calls === 1 ? HttpResponse.error() : completedOrder();
      }),
    );

    const order = await buildClient().orders.get({ orderId: "ORDER-1" });

    expect(order.orderId).toBe("ORDER-1");
    expect(calls).toBe(2);
  });

  test("retries a 5xx, then succeeds", async () => {
    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        calls += 1;

        return calls === 1
          ? HttpResponse.json({ name: "INTERNAL_SERVER_ERROR" }, { status: 503 })
          : completedOrder();
      }),
    );

    const order = await buildClient().orders.get({ orderId: "ORDER-1" });

    expect(order.orderId).toBe("ORDER-1");
    expect(calls).toBe(2);
  });

  test("gives up after maxAttempts on a persistent 500", async () => {
    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        calls += 1;

        return HttpResponse.json({ name: "INTERNAL_SERVER_ERROR" }, { status: 500 });
      }),
    );

    await expect(buildClient().orders.get({ orderId: "ORDER-1" })).rejects.toThrow();
    expect(calls).toBe(3);
  });

  test("honours Retry-After on a 429", async () => {
    const delays: number[] = [];
    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        calls += 1;

        return calls === 1
          ? HttpResponse.json(
              { name: "RATE_LIMIT_REACHED" },
              { status: 429, headers: { "Retry-After": "2" } },
            )
          : completedOrder();
      }),
    );

    const order = await buildClient({
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    }).orders.get({ orderId: "ORDER-1" });

    expect(order.orderId).toBe("ORDER-1");
    expect(delays).toEqual([2000]);
  });

  test("uses exponential backoff on a 429 without Retry-After", async () => {
    const delays: number[] = [];
    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        calls += 1;

        return calls === 1
          ? HttpResponse.json({ name: "RATE_LIMIT_REACHED" }, { status: 429 })
          : completedOrder();
      }),
    );

    await buildClient({
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    }).orders.get({ orderId: "ORDER-1" });

    expect(delays).toHaveLength(1);
    expect(delays[0] ?? 0).toBeGreaterThanOrEqual(250);
  });

  test("honours an HTTP-date Retry-After", async () => {
    const delays: number[] = [];
    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        calls += 1;

        return calls === 1
          ? HttpResponse.json(
              { name: "RATE_LIMIT_REACHED" },
              { status: 429, headers: { "Retry-After": new Date(5000).toUTCString() } },
            )
          : completedOrder();
      }),
    );

    await buildClient({
      now: () => 0,
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    }).orders.get({ orderId: "ORDER-1" });

    expect(delays).toEqual([5000]);
  });

  test("never retries a 4xx (400)", async () => {
    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        calls += 1;

        return HttpResponse.json({ name: "INVALID_REQUEST" }, { status: 400 });
      }),
    );

    await expect(buildClient().orders.get({ orderId: "ORDER-1" })).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("idempotency", () => {
  test("sends the same PayPal-Request-Id on every retry", async () => {
    const requestIds: (string | null)[] = [];
    let calls = 0;
    server.use(
      tokenHandler(),
      http.post(PAYOUT_URL, ({ request }) => {
        calls += 1;
        requestIds.push(request.headers.get("paypal-request-id"));

        return calls < 3 ? HttpResponse.json({ name: "INTERNAL" }, { status: 500 }) : payoutBody();
      }),
    );

    const result = await buildClient().payouts.createSingle({
      requestId: "int_01IDEMPOTENT",
      senderBatchId: "int_01IDEMPOTENT",
      payeeEmail: "vendor@example.com",
      amountCents: 1250n,
      currency: "USD",
      note: "Deposit",
    });

    expect(result).toEqual({ batchId: "BATCH-1", status: "PENDING" });
    expect(calls).toBe(3);
    expect(requestIds).toEqual(["int_01IDEMPOTENT", "int_01IDEMPOTENT", "int_01IDEMPOTENT"]);
  });

  test("uses the default sleep when none is injected", async () => {
    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        calls += 1;

        return calls === 1
          ? HttpResponse.json({ name: "INTERNAL" }, { status: 500 })
          : completedOrder();
      }),
    );

    const client = createPayPalClient({
      env: "sandbox",
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
      maxAttempts: 2,
    });

    const order = await client.orders.get({ orderId: "ORDER-1" });

    expect(order.orderId).toBe("ORDER-1");
    expect(calls).toBe(2);
  });
});
