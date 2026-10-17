#!/usr/bin/env bun
/**
 * PayPal sandbox check (apps/gateway only — AGENTS.md invariant #1).
 *
 * Verifies OAuth2, Invoicing v2, Payouts v1 and (optionally) the webhook against
 * the PayPal sandbox, through `@kitty/paypal` (the same client the gateway uses
 * on the money path). Never prints secrets or access tokens. Not part of CI:
 * `bun run sandbox:check`. See docs/08-infrastructure.md §4 and docs/11 §2.
 */
import { createPayPalClient, PayPalApiError } from "@kitty/paypal";
import { isoDate, readSandboxEnv, type SandboxEnv } from "../src/lib/paypal-sandbox";

const ENV_HINT = "apps/gateway/.env.example (see docs/08-infrastructure.md §4)";
const AMOUNT_CENTS = 100n;
const AMOUNT_VALUE = "1.00";

let failures = 0;

function printPass(label: string): void {
  console.log(`PASS ${label}`);
}

function printFail(label: string, error: unknown): void {
  failures += 1;
  console.log(`FAIL ${label}${debugIdSuffix(error)}`);
}

function debugIdSuffix(error: unknown): string {
  if (error instanceof PayPalApiError && error.debugId !== undefined) {
    return ` (debug_id: ${error.debugId})`;
  }

  return "";
}

function describeError(error: unknown): string {
  if (error instanceof PayPalApiError) {
    return `${error.status ?? "network error"} ${error.message}`;
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

const paypal = createPayPalClient({
  env: sandboxEnv.PAYPAL_ENV,
  clientId: sandboxEnv.PAYPAL_CLIENT_ID,
  clientSecret: sandboxEnv.PAYPAL_CLIENT_SECRET,
});

console.log(`sandbox-check: PayPal ${sandboxEnv.PAYPAL_ENV} — ${paypal.baseUrl}`);

// 1. OAuth2 client credentials.
try {
  await paypal.verifyCredentials();
  printPass("OAuth2 client credentials (access token acquired; token never printed)");
} catch (error) {
  printFail(`OAuth2 client credentials — ${describeError(error)}`, error);
  process.exit(1);
}

const startedAt = new Date();

// 2. Invoicing v2: draft + send.
const invoiceNumber = `KTY-SANDBOX-${startedAt.getTime()}`;
try {
  const draft = await paypal.invoicing.createDraft({
    requestId: `${invoiceNumber}-create`,
    invoiceNumber,
    currency: "USD",
    dueDate: isoDate(new Date(startedAt.getTime() + 7 * 24 * 60 * 60 * 1000)),
    invoicerEmail: sandboxEnv.PLATFORM_PAYPAL_EMAIL,
    invoicerBusinessName: "Kitty — sandbox check",
    recipientEmail: sandboxEnv.PAYPAL_SANDBOX_PAYER_EMAIL,
    note: "Kitty sandbox check — please ignore.",
    items: [{ name: "Sandbox check", quantity: "1", amountCents: AMOUNT_CENTS }],
  });

  const sent = await paypal.invoicing.send({
    invoiceId: draft.invoiceId,
    requestId: `${invoiceNumber}-send`,
  });

  printPass(
    `Invoicing v2 — invoice ${draft.invoiceId} for $${AMOUNT_VALUE} to ${sandboxEnv.PAYPAL_SANDBOX_PAYER_EMAIL}, status=${sent.status ?? "unknown"}`,
  );
} catch (error) {
  printFail(`Invoicing v2 — ${describeError(error)}`, error);
}

// 3. Payouts v1 (1 batch = 1 item).
const senderBatchId = `sandbox-check-${startedAt.toISOString()}`;
try {
  const payout = await paypal.payouts.createSingle({
    requestId: senderBatchId,
    senderBatchId,
    payeeEmail: sandboxEnv.PAYPAL_SANDBOX_PAYEE_EMAIL,
    amountCents: AMOUNT_CENTS,
    currency: "USD",
    note: "Kitty sandbox check",
  });

  printPass(
    `Payouts v1 — batch ${payout.batchId} for $${AMOUNT_VALUE} to ${sandboxEnv.PAYPAL_SANDBOX_PAYEE_EMAIL}, status=${payout.status}`,
  );
} catch (error) {
  printFail(`Payouts v1 — ${describeError(error)}`, error);
}

// 4. Webhook registration (optional).
if (sandboxEnv.PAYPAL_WEBHOOK_ID === undefined) {
  console.log("SKIP webhook check (PAYPAL_WEBHOOK_ID not set)");
} else {
  try {
    const webhook = await paypal.webhooks.getWebhook({ webhookId: sandboxEnv.PAYPAL_WEBHOOK_ID });
    const events = webhook.eventTypes.join(", ");

    printPass(`Webhook ${webhook.url ?? "unknown"} — events: ${events}`);
  } catch (error) {
    printFail(`Webhook lookup — ${describeError(error)}`, error);
  }
}

if (failures > 0) {
  console.error(`sandbox-check: ${failures} check(s) failed.`);
  process.exit(1);
}

console.log("sandbox-check: all checks passed.");
