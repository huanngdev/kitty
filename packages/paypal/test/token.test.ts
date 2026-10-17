import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import {
  buildClient,
  PAYPAL_BASE,
  server,
  TEST_ACCESS_TOKEN,
  tokenHandler,
  usePayPalServer,
} from "./support/server";

usePayPalServer();

const ORDER_URL = `${PAYPAL_BASE}/v2/checkout/orders/ORDER-1`;

function completedOrder(): Response {
  return HttpResponse.json({ id: "ORDER-1", status: "COMPLETED" });
}

describe("access token caching", () => {
  test("reuses a cached token across calls", async () => {
    let tokenCalls = 0;
    server.use(
      tokenHandler({
        onRequest: () => {
          tokenCalls += 1;
        },
      }),
      http.get(ORDER_URL, () => completedOrder()),
    );

    const client = buildClient();
    await client.orders.get({ orderId: "ORDER-1" });
    await client.orders.get({ orderId: "ORDER-1" });

    expect(tokenCalls).toBe(1);
  });

  test("refreshes after expires_in − 60s", async () => {
    let tokenCalls = 0;
    let currentTime = 1_000_000;
    server.use(
      tokenHandler({
        expiresIn: 3600,
        onRequest: () => {
          tokenCalls += 1;
        },
      }),
      http.get(ORDER_URL, () => completedOrder()),
    );

    const client = buildClient({ now: () => currentTime });
    await client.orders.get({ orderId: "ORDER-1" });

    // Still inside the cache window (3540s): no new token.
    currentTime += 3_540_000 - 1;
    await client.orders.get({ orderId: "ORDER-1" });
    expect(tokenCalls).toBe(1);

    // Past the window: refresh.
    currentTime += 2;
    await client.orders.get({ orderId: "ORDER-1" });
    expect(tokenCalls).toBe(2);
  });

  test("shares one in-flight token request between concurrent callers", async () => {
    let tokenCalls = 0;
    server.use(
      http.post(`${PAYPAL_BASE}/v1/oauth2/token`, async () => {
        tokenCalls += 1;
        await new Promise((resolve) => {
          setTimeout(resolve, 25);
        });

        return HttpResponse.json({
          access_token: TEST_ACCESS_TOKEN,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }),
      http.get(ORDER_URL, () => completedOrder()),
      http.get(`${PAYPAL_BASE}/v2/checkout/orders/ORDER-2`, () =>
        HttpResponse.json({ id: "ORDER-2", status: "COMPLETED" }),
      ),
    );

    const client = buildClient();
    const [first, second] = await Promise.all([
      client.orders.get({ orderId: "ORDER-1" }),
      client.orders.get({ orderId: "ORDER-2" }),
    ]);

    expect(first.orderId).toBe("ORDER-1");
    expect(second.orderId).toBe("ORDER-2");
    expect(tokenCalls).toBe(1);
  });
});

describe("verifyCredentials", () => {
  test("acquires a token, returns nothing and reuses the cache", async () => {
    let tokenCalls = 0;
    server.use(
      tokenHandler({
        onRequest: () => {
          tokenCalls += 1;
        },
      }),
    );

    const client = buildClient();
    await expect(client.verifyCredentials()).resolves.toBeUndefined();
    await client.verifyCredentials();

    expect(tokenCalls).toBe(1);
  });

  test("rejects when the credentials are rejected", async () => {
    server.use(
      http.post(`${PAYPAL_BASE}/v1/oauth2/token`, () =>
        HttpResponse.json({ error: "invalid_client" }, { status: 401 }),
      ),
    );

    await expect(buildClient().verifyCredentials()).rejects.toThrow();
  });
});

describe("401 handling", () => {
  test("refreshes the token exactly once and retries the request", async () => {
    let tokenCalls = 0;
    let orderCalls = 0;
    const tokens = ["stale-token", "fresh-token"];
    server.use(
      http.post(`${PAYPAL_BASE}/v1/oauth2/token`, () => {
        const token = tokens[tokenCalls] ?? "fresh-token";
        tokenCalls += 1;

        return HttpResponse.json({ access_token: token, expires_in: 3600, token_type: "Bearer" });
      }),
      http.get(ORDER_URL, ({ request }) => {
        orderCalls += 1;
        if (orderCalls === 1) {
          expect(request.headers.get("authorization")).toBe("Bearer stale-token");

          return HttpResponse.json(
            { name: "AUTHENTICATION_FAILURE", message: "expired" },
            { status: 401 },
          );
        }

        expect(request.headers.get("authorization")).toBe("Bearer fresh-token");

        return completedOrder();
      }),
    );

    const order = await buildClient().orders.get({ orderId: "ORDER-1" });

    expect(order.orderId).toBe("ORDER-1");
    expect(orderCalls).toBe(2);
    expect(tokenCalls).toBe(2);
  });

  test("does not loop forever when the refreshed token is also rejected", async () => {
    let orderCalls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDER_URL, () => {
        orderCalls += 1;

        return HttpResponse.json(
          { name: "AUTHENTICATION_FAILURE", message: "nope" },
          { status: 401 },
        );
      }),
    );

    await expect(buildClient().orders.get({ orderId: "ORDER-1" })).rejects.toThrow("nope");
    // First attempt 401 → refresh → second 401 → stop (one refresh only).
    expect(orderCalls).toBe(2);
  });
});
