import axios, { type AxiosInstance } from "axios";
import { paypalBaseUrl } from "./base-url";
import { createTransport } from "./http";
import { createInvoicingNamespace } from "./invoicing";
import { createOrdersNamespace } from "./orders";
import { createPaymentsNamespace } from "./payments";
import { createPayoutsNamespace } from "./payouts";
import type { PayPalClient, PayPalClientOptions } from "./types";
import { createWebhooksNamespace } from "./webhooks";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Builds the typed PayPal REST client used by the Leash Gateway only
 * (AGENTS.md invariant #1). The client owns one axios instance per call and
 * caches the OAuth2 token until `expires_in − 60s`.
 *
 * ```ts
 * const paypal = createPayPalClient({
 *   env: "sandbox",
 *   clientId: gatewayEnv.paypalClientId,
 *   clientSecret: gatewayEnv.paypalClientSecret,
 *   logger,
 * });
 * ```
 */
export function createPayPalClient(options: PayPalClientOptions): PayPalClient {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = paypalBaseUrl(options.env);
  const instance: AxiosInstance =
    options.http ??
    axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      // Bun ships a native `fetch`; the fetch adapter keeps one code path in
      // production and in tests (MSW intercepts `fetch`).
      adapter: "fetch",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });

  const transport = createTransport({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    instance,
    now,
    sleep,
    logger: options.logger,
    maxAttempts,
  });

  return {
    environment: options.env,
    baseUrl,
    invoicing: createInvoicingNamespace(transport),
    payouts: createPayoutsNamespace(transport),
    orders: createOrdersNamespace(transport),
    payments: createPaymentsNamespace(transport),
    webhooks: createWebhooksNamespace(transport),
    verifyCredentials: () => transport.verifyCredentials(),
  };
}
