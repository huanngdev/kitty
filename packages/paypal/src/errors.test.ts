import { describe, expect, test } from "bun:test";
import { HttpResponse, http } from "msw";
import { PayPalApiError, toPayPalApiError } from "./errors";
import {
  buildClient,
  PAYPAL_BASE,
  server,
  TEST_ACCESS_TOKEN,
  TEST_CLIENT_SECRET,
  tokenHandler,
  usePayPalServer,
} from "./test-support/server";
import type { PayPalLogger } from "./types";

usePayPalServer();

const ORDERS_URL = `${PAYPAL_BASE}/v2/checkout/orders/ORDER-1`;

describe("PayPalApiError", () => {
  test("always carries a safe, complete JSON shape", () => {
    const error = new PayPalApiError({
      status: 400,
      paypalName: "INVALID_REQUEST",
      message: "Request is not well-formed",
      debugId: "dbg-1",
      issueCodes: ["INVALID_REQUEST", "MISSING_REQUIRED_PARAMETER"],
      details: [
        {
          field: "amount",
          value: "1.00",
          location: "body",
          issue: "MISSING_REQUIRED_PARAMETER",
          description: "amount is required",
        },
      ],
    });

    expect(error.name).toBe("PayPalApiError");
    expect(error.code).toBe("PAYPAL_API");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: "PAYPAL_API",
      name: "PayPalApiError",
      status: 400,
      paypalName: "INVALID_REQUEST",
      message: "Request is not well-formed",
      debugId: "dbg-1",
      issueCodes: ["INVALID_REQUEST", "MISSING_REQUIRED_PARAMETER"],
      details: [
        {
          field: "amount",
          value: "1.00",
          location: "body",
          issue: "MISSING_REQUIRED_PARAMETER",
          description: "amount is required",
        },
      ],
    });
  });
});

describe("toPayPalApiError", () => {
  test("returns an existing PayPalApiError unchanged", () => {
    const error = new PayPalApiError({
      status: 500,
      paypalName: undefined,
      message: "boom",
      debugId: undefined,
      issueCodes: [],
      details: [],
    });

    expect(toPayPalApiError(error)).toBe(error);
  });

  test("wraps a plain Error", () => {
    const error = toPayPalApiError(new Error("plain"));
    expect(error.message).toBe("plain");
    expect(error.status).toBeUndefined();
  });

  test("wraps an unknown non-error value", () => {
    expect(toPayPalApiError("nope").message).toBe("Unknown PayPal client failure");
  });
});

describe("PayPal REST error bodies", () => {
  test("maps name, message, debug_id, details and issue codes", async () => {
    server.use(
      tokenHandler(),
      http.get(ORDERS_URL, () =>
        HttpResponse.json(
          {
            name: "INVALID_REQUEST",
            message: "Request is not well-formed",
            debug_id: "dbg-rest",
            details: [{ field: "amount", issue: "MISSING_REQUIRED_PARAMETER" }],
          },
          { status: 400 },
        ),
      ),
    );

    const error = await buildClient()
      .orders.get({ orderId: "ORDER-1" })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PayPalApiError);
    if (!(error instanceof PayPalApiError)) {
      throw new Error("expected a PayPalApiError");
    }
    expect(error.status).toBe(400);
    expect(error.paypalName).toBe("INVALID_REQUEST");
    expect(error.message).toBe("Request is not well-formed");
    expect(error.debugId).toBe("dbg-rest");
    expect(error.issueCodes).toEqual(["INVALID_REQUEST", "MISSING_REQUIRED_PARAMETER"]);
    expect(error.details).toEqual([
      {
        field: "amount",
        value: undefined,
        location: undefined,
        issue: "MISSING_REQUIRED_PARAMETER",
        description: undefined,
      },
    ]);
  });

  test("reads a PayPal-Debug-Id header when the body has none", async () => {
    server.use(
      tokenHandler(),
      http.get(ORDERS_URL, () =>
        HttpResponse.json(
          { name: "INTERNAL_SERVER_ERROR", message: "oops" },
          { status: 500, headers: { "PayPal-Debug-Id": "header-debug" } },
        ),
      ),
    );

    const error = await buildClient({ maxAttempts: 1 })
      .orders.get({ orderId: "ORDER-1" })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PayPalApiError);
    if (error instanceof PayPalApiError) {
      expect(error.debugId).toBe("header-debug");
    }
  });

  test("falls back to a generic message for a bodyless error", async () => {
    server.use(
      tokenHandler(),
      http.get(ORDERS_URL, () => new HttpResponse("", { status: 418 })),
    );

    const error = await buildClient({ maxAttempts: 1 })
      .orders.get({ orderId: "ORDER-1" })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PayPalApiError);
    if (error instanceof PayPalApiError) {
      expect(error.message).toBe("PayPal request failed with status 418");
      expect(error.issueCodes).toEqual([]);
    }
  });
});

describe("OAuth error bodies", () => {
  test("wraps a token failure as a PayPalApiError", async () => {
    server.use(
      http.post(`${PAYPAL_BASE}/v1/oauth2/token`, () =>
        HttpResponse.json(
          { error: "invalid_client", error_description: "Client Authentication failed" },
          { status: 401 },
        ),
      ),
      http.get(ORDERS_URL, () => HttpResponse.json({ id: "ORDER-1", status: "COMPLETED" })),
    );

    const error = await buildClient()
      .orders.get({ orderId: "ORDER-1" })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PayPalApiError);
    if (error instanceof PayPalApiError) {
      expect(error.status).toBe(401);
      expect(error.paypalName).toBe("invalid_client");
      expect(error.message).toBe("Client Authentication failed");
    }
  });
});

describe("network errors", () => {
  test("wraps a network failure with no response", async () => {
    server.use(
      tokenHandler(),
      http.get(ORDERS_URL, () => HttpResponse.error()),
    );

    const error = await buildClient({ maxAttempts: 1 })
      .orders.get({ orderId: "ORDER-1" })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PayPalApiError);
    if (error instanceof PayPalApiError) {
      expect(error.status).toBeUndefined();
      expect(error.message).toContain("before a response");
    }
  });
});

describe("redaction", () => {
  test("never serializes the secret, the access token or the Authorization header", async () => {
    server.use(
      tokenHandler(),
      http.get(ORDERS_URL, () => HttpResponse.error()),
    );

    const error = await buildClient({ maxAttempts: 1 })
      .orders.get({ orderId: "ORDER-1" })
      .catch((thrown: unknown) => thrown);

    if (!(error instanceof PayPalApiError)) {
      throw new Error("expected a PayPalApiError");
    }

    // `toJSON` plus the enumerable own properties (what pino serializes).
    const serialized = `${JSON.stringify(error)}\n${JSON.stringify({ ...error })}`;

    expect(serialized).not.toContain(TEST_CLIENT_SECRET);
    expect(serialized).not.toContain(TEST_ACCESS_TOKEN);
    expect(serialized.toLowerCase()).not.toContain("authorization");
  });

  test("never logs the secret or the access token", async () => {
    const events: Record<string, unknown>[] = [];
    const logger: PayPalLogger = {
      debug: (event) => events.push({ ...event }),
      warn: (event) => events.push({ ...event }),
      error: (event) => events.push({ ...event }),
    };

    let calls = 0;
    server.use(
      tokenHandler(),
      http.get(ORDERS_URL, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({ name: "INTERNAL" }, { status: 500 });
        }

        return HttpResponse.json({ id: "ORDER-1", status: "COMPLETED" });
      }),
    );

    await buildClient({ logger, maxAttempts: 3 }).orders.get({ orderId: "ORDER-1" });

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(TEST_CLIENT_SECRET);
    expect(serialized).not.toContain(TEST_ACCESS_TOKEN);
    expect(serialized).not.toContain("Bearer");
  });
});
