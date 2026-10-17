import { afterAll, afterEach, beforeAll } from "bun:test";
import { HttpResponse, http, type RequestHandler } from "msw";
import { setupServer } from "msw/node";
import { createPayPalClient } from "../../src/client";
import type { PayPalClient, PayPalClientOptions } from "../../src/types";

/** Sandbox base URL the client uses in every test. */
export const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";
export const TOKEN_URL = `${PAYPAL_BASE}/v1/oauth2/token`;

export const TEST_CLIENT_ID = "test-client-id";
export const TEST_CLIENT_SECRET = "test-client-secret-should-never-leak";
export const TEST_ACCESS_TOKEN = "test-access-token-should-never-leak";

/** Shared MSW server; each test file registers handlers via `server.use`. */
export const server = setupServer();

/** Registers the MSW lifecycle hooks for a test file. */
export function usePayPalServer(): void {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
}

export interface TokenHandlerOptions {
  readonly token?: string;
  readonly expiresIn?: number;
  readonly onRequest?: () => void;
}

/** Default OAuth handler; override for expiry/refresh/single-flight tests. */
export function tokenHandler(options: TokenHandlerOptions = {}): RequestHandler {
  return http.post(TOKEN_URL, () => {
    options.onRequest?.();

    return HttpResponse.json({
      access_token: options.token ?? TEST_ACCESS_TOKEN,
      expires_in: options.expiresIn ?? 3600,
      token_type: "Bearer",
    });
  });
}

/** Builds a client bound to the sandbox with all side effects injectable. */
export function buildClient(options: Partial<PayPalClientOptions> = {}): PayPalClient {
  return createPayPalClient({
    env: "sandbox",
    clientId: TEST_CLIENT_ID,
    clientSecret: TEST_CLIENT_SECRET,
    sleep: async () => undefined,
    ...options,
  });
}
