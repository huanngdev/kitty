#!/usr/bin/env bun
/**
 * PayPal sandbox check (apps/gateway only — AGENTS.md invariant #1).
 *
 * Verifies OAuth2, Invoicing v2, Payouts v1 and (optionally) the webhook against
 * the PayPal sandbox. Never prints secrets or access tokens. Not part of CI:
 * `bun run sandbox:check`. See docs/08-infrastructure.md §4 and docs/11 §2.
 */
import axios, { type AxiosInstance, isAxiosError } from "axios";
import {
  buildInvoiceRequest,
  buildPayoutRequest,
  extractInvoiceId,
  isoDate,
  paypalBaseUrl,
  readSandboxEnv,
  type SandboxEnv,
} from "../src/lib/paypal-sandbox";

const ENV_HINT = "apps/gateway/.env.example (see docs/08-infrastructure.md §4)";
const AMOUNT_VALUE = "1.00";
const TOKEN_TTL_HINT = 20_000;

let failures = 0;

function printPass(label: string): void {
  console.log(`PASS ${label}`);
}

function printFail(label: string, error: unknown): void {
  failures += 1;
  console.log(`FAIL ${label}${debugIdSuffix(error)}`);
}

function debugIdSuffix(error: unknown): string {
  if (!isAxiosError(error)) {
    return "";
  }

  const data: unknown = error.response?.data;
  if (data !== null && typeof data === "object" && "debug_id" in data) {
    const debugId = (data as { debug_id?: unknown }).debug_id;
    if (typeof debugId === "string") {
      return ` (debug_id: ${debugId})`;
    }
  }

  return "";
}

function describeError(error: unknown): string {
  if (isAxiosError(error)) {
    return `${error.response?.status ?? "network error"} ${error.message}`;
  }

  return String(error);
}

const parsedEnv = readSandboxEnv(process.env);

if (!parsedEnv.ok) {
  console.error("sandbox-check: PayPal sandbox env is incomplete.");
  if (parsedEnv.missing.length > 0) {
    console.error(`  missing: ${parsedEnv.missing.join(", ")}`);
  }
  if (parsedEnv.invalid.length > 0) {
    console.error(`  invalid: ${parsedEnv.invalid.join(", ")}`);
  }
  console.error(`  hint: copy ${ENV_HINT} and fill these in.`);
  process.exit(1);
}

const sandboxEnv: SandboxEnv = parsedEnv.env;

if (sandboxEnv.PAYPAL_ENV === "live") {
  console.error("sandbox-check: refusing to run with PAYPAL_ENV=live (sandbox only).");
  process.exit(1);
}

console.log(
  `sandbox-check: PayPal ${sandboxEnv.PAYPAL_ENV} — ${paypalBaseUrl(sandboxEnv.PAYPAL_ENV)}`,
);

const client: AxiosInstance = axios.create({
  baseURL: paypalBaseUrl(sandboxEnv.PAYPAL_ENV),
  timeout: TOKEN_TTL_HINT,
});

async function requestAccessToken(): Promise<string> {
  const response = await client.post<{ access_token: string }>(
    "/v1/oauth2/token",
    "grant_type=client_credentials",
    {
      auth: { username: sandboxEnv.PAYPAL_CLIENT_ID, password: sandboxEnv.PAYPAL_CLIENT_SECRET },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  return response.data.access_token;
}

// 1. OAuth2 client credentials.
const accessToken = await requestAccessToken().catch((error: unknown): undefined => {
  printFail(`OAuth2 client credentials — ${describeError(error)}`, error);

  return undefined;
});

if (accessToken === undefined) {
  process.exit(1);
}

printPass("OAuth2 client credentials (access token acquired; token never printed)");

const authed: AxiosInstance = axios.create({
  baseURL: paypalBaseUrl(sandboxEnv.PAYPAL_ENV),
  timeout: TOKEN_TTL_HINT,
  headers: { Authorization: `Bearer ${accessToken}` },
});

const startedAt = new Date();

// 2. Invoicing v2: draft + send.
const invoiceNumber = `KTY-SANDBOX-${startedAt.getTime()}`;
try {
  const draft = buildInvoiceRequest({
    platformEmail: sandboxEnv.PLATFORM_PAYPAL_EMAIL,
    payerEmail: sandboxEnv.PAYPAL_SANDBOX_PAYER_EMAIL,
    invoiceNumber,
    dueDate: isoDate(new Date(startedAt.getTime() + 7 * 24 * 60 * 60 * 1000)),
    amountValue: AMOUNT_VALUE,
  });

  const created = await authed.post<unknown>("/v2/invoicing/invoices", draft, {
    headers: {
      "PayPal-Request-Id": `${invoiceNumber}-create`,
      // Ask for the representation back; Invoicing v2 still answers 201 with a
      // HATEOAS link, so the id is read from the body *or* the Location header.
      Prefer: "return=representation",
    },
  });

  const invoiceId = extractInvoiceId({
    body: created.data,
    location: created.headers.location ?? null,
  });

  const sent = await authed.post<{ status?: string }>(
    `/v2/invoicing/invoices/${invoiceId}/send`,
    {},
    { headers: { "PayPal-Request-Id": `${invoiceNumber}-send` } },
  );

  printPass(
    `Invoicing v2 — invoice ${invoiceId} for $${AMOUNT_VALUE} to ${sandboxEnv.PAYPAL_SANDBOX_PAYER_EMAIL}, status=${sent.data.status ?? "unknown"}`,
  );
} catch (error) {
  printFail(`Invoicing v2 — ${describeError(error)}`, error);
}

// 3. Payouts v1 (1 batch = 1 item).
const senderBatchId = `sandbox-check-${startedAt.toISOString()}`;
try {
  const payout = buildPayoutRequest({
    payeeEmail: sandboxEnv.PAYPAL_SANDBOX_PAYEE_EMAIL,
    senderBatchId,
    amountValue: AMOUNT_VALUE,
    note: "Kitty sandbox check",
  });

  const response = await authed.post<{
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  }>("/v1/payments/payouts", payout, { headers: { "PayPal-Request-Id": senderBatchId } });

  const header = response.data.batch_header;

  printPass(
    `Payouts v1 — batch ${header?.payout_batch_id ?? "unknown"} for $${AMOUNT_VALUE} to ${sandboxEnv.PAYPAL_SANDBOX_PAYEE_EMAIL}, status=${header?.batch_status ?? "unknown"}`,
  );
} catch (error) {
  printFail(`Payouts v1 — ${describeError(error)}`, error);
}

// 4. Webhook registration (optional).
if (sandboxEnv.PAYPAL_WEBHOOK_ID === undefined) {
  console.log("SKIP webhook check (PAYPAL_WEBHOOK_ID not set)");
} else {
  try {
    const response = await authed.get<{ url?: string; event_types?: { name?: string }[] }>(
      `/v1/notifications/webhooks/${sandboxEnv.PAYPAL_WEBHOOK_ID}`,
    );

    const events = (response.data.event_types ?? []).map((event) => event.name ?? "?").join(", ");
    printPass(`Webhook ${response.data.url ?? "unknown"} — events: ${events}`);
  } catch (error) {
    printFail(`Webhook lookup — ${describeError(error)}`, error);
  }
}

if (failures > 0) {
  console.error(`sandbox-check: ${failures} check(s) failed.`);
  process.exit(1);
}

console.log("sandbox-check: all checks passed.");
