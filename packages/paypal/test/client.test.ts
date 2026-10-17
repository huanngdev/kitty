import { describe, expect, test } from "bun:test";
import axios from "axios";
import { HttpResponse, http } from "msw";
import { PAYPAL_BASE_URLS, paypalBaseUrl } from "../src/base-url";
import { createPayPalClient } from "../src/client";
import {
  buildClient,
  PAYPAL_BASE,
  server,
  TEST_CLIENT_ID,
  TEST_CLIENT_SECRET,
  tokenHandler,
  TOKEN_URL,
  usePayPalServer,
} from "./support/server";

usePayPalServer();

describe("paypalBaseUrl", () => {
  test("maps environments to REST base URLs", () => {
    expect(paypalBaseUrl("sandbox")).toBe("https://api-m.sandbox.paypal.com");
    expect(paypalBaseUrl("live")).toBe("https://api-m.paypal.com");
    expect(PAYPAL_BASE_URLS.live).toBe("https://api-m.paypal.com");
  });
});

describe("createPayPalClient", () => {
  test("exposes the environment, base url and namespaces", () => {
    const client = createPayPalClient({
      env: "live",
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
    });

    expect(client.environment).toBe("live");
    expect(client.baseUrl).toBe("https://api-m.paypal.com");
    expect(typeof client.invoicing.createDraft).toBe("function");
    expect(typeof client.payouts.createSingle).toBe("function");
    expect(typeof client.orders.create).toBe("function");
    expect(typeof client.payments.refundCapture).toBe("function");
    expect(typeof client.webhooks.verifySignature).toBe("function");
    expect(typeof client.verifyCredentials).toBe("function");
  });

  test("uses an injected axios instance when provided", async () => {
    let seenBaseUrl = "";
    server.use(
      tokenHandler(),
      http.get(`${PAYPAL_BASE}/v2/checkout/orders/ORDER-1`, () => {
        seenBaseUrl = PAYPAL_BASE;

        return HttpResponse.json({ id: "ORDER-1", status: "COMPLETED" });
      }),
    );

    const client = buildClient({
      http: axios.create({
        baseURL: PAYPAL_BASE,
        adapter: "fetch",
        headers: { "X-Injected": "1" },
      }),
    });

    const order = await client.orders.get({ orderId: "ORDER-1" });

    expect(order.orderId).toBe("ORDER-1");
    expect(seenBaseUrl).toBe(PAYPAL_BASE);
  });

  test("does not request before a call is made", () => {
    let tokenCalls = 0;
    server.use(
      http.post(TOKEN_URL, () => {
        tokenCalls += 1;

        return HttpResponse.json({ access_token: "t", expires_in: 3600 });
      }),
    );

    createPayPalClient({
      env: "sandbox",
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
    });

    expect(tokenCalls).toBe(0);
  });
});
