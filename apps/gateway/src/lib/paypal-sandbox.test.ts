import { describe, expect, test } from "bun:test";
import {
  buildInvoiceRequest,
  buildPayoutRequest,
  isoDate,
  missingSandboxEnvKeys,
  paypalBaseUrl,
  readSandboxEnv,
  requiredSandboxEnvKeys,
} from "./paypal-sandbox";

const validSource: Record<string, string> = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "client-id",
  PAYPAL_CLIENT_SECRET: "client-secret",
  PLATFORM_PAYPAL_EMAIL: "platform@example.com",
  PAYPAL_SANDBOX_PAYER_EMAIL: "payer@example.com",
  PAYPAL_SANDBOX_PAYEE_EMAIL: "payee@example.com",
};

describe("missingSandboxEnvKeys", () => {
  test("lists every required name when nothing is set", () => {
    expect(missingSandboxEnvKeys({})).toEqual([...requiredSandboxEnvKeys]);
  });

  test("treats blank values as missing", () => {
    expect(missingSandboxEnvKeys({ ...validSource, PAYPAL_CLIENT_SECRET: "   " })).toEqual([
      "PAYPAL_CLIENT_SECRET",
    ]);
  });

  test("returns nothing for a complete env", () => {
    expect(missingSandboxEnvKeys(validSource)).toEqual([]);
  });
});

describe("readSandboxEnv", () => {
  test("parses a complete sandbox env", () => {
    const result = readSandboxEnv(validSource);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.PAYPAL_ENV).toBe("sandbox");
      expect(result.env.PAYPAL_SANDBOX_PAYER_EMAIL).toBe("payer@example.com");
      expect(result.env.PAYPAL_WEBHOOK_ID).toBeUndefined();
    }
  });

  test("defaults PAYPAL_ENV to sandbox", () => {
    const result = readSandboxEnv({
      PAYPAL_CLIENT_ID: "client-id",
      PAYPAL_CLIENT_SECRET: "client-secret",
      PLATFORM_PAYPAL_EMAIL: "platform@example.com",
      PAYPAL_SANDBOX_PAYER_EMAIL: "payer@example.com",
      PAYPAL_SANDBOX_PAYEE_EMAIL: "payee@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.PAYPAL_ENV).toBe("sandbox");
    }
  });

  test("reports missing names before validating values", () => {
    const result = readSandboxEnv({ PAYPAL_CLIENT_ID: "client-id" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("PAYPAL_CLIENT_SECRET");
      expect(result.invalid).toEqual([]);
    }
  });

  test("reports invalid emails by field name", () => {
    const result = readSandboxEnv({ ...validSource, PAYPAL_SANDBOX_PAYER_EMAIL: "not-an-email" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalid).toContain("PAYPAL_SANDBOX_PAYER_EMAIL");
    }
  });
});

describe("paypalBaseUrl", () => {
  test("maps env to the PayPal REST base URL", () => {
    expect(paypalBaseUrl("sandbox")).toBe("https://api-m.sandbox.paypal.com");
    expect(paypalBaseUrl("live")).toBe("https://api-m.paypal.com");
  });
});

describe("isoDate", () => {
  test("formats a date as YYYY-MM-DD", () => {
    expect(isoDate(new Date("2026-11-20T10:30:00.000Z"))).toBe("2026-11-20");
  });
});

describe("buildInvoiceRequest", () => {
  test("builds a single-item $1 USD draft for the payer", () => {
    const draft = buildInvoiceRequest({
      platformEmail: "platform@example.com",
      payerEmail: "payer@example.com",
      invoiceNumber: "KTY-SANDBOX-1",
      dueDate: "2026-11-20",
      amountValue: "1.00",
    });

    expect(draft.detail.currency_code).toBe("USD");
    expect(draft.detail.invoice_number).toBe("KTY-SANDBOX-1");
    expect(draft.detail.payment_term.due_date).toBe("2026-11-20");
    expect(draft.invoicer.email_address).toBe("platform@example.com");
    expect(draft.primary_recipients[0]?.billing_info.email_address).toBe("payer@example.com");
    expect(draft.items[0]?.unit_amount).toEqual({ currency_code: "USD", value: "1.00" });
  });
});

describe("buildPayoutRequest", () => {
  test("builds a 1-item payout batch with the sender batch id", () => {
    const payout = buildPayoutRequest({
      payeeEmail: "payee@example.com",
      senderBatchId: "sandbox-check-2026-11-20T00:00:00.000Z",
      amountValue: "1.00",
      note: "Kitty sandbox check",
    });

    expect(payout.sender_batch_header.sender_batch_id).toBe(
      "sandbox-check-2026-11-20T00:00:00.000Z",
    );
    expect(payout.items).toHaveLength(1);
    expect(payout.items[0]?.recipient_type).toBe("EMAIL");
    expect(payout.items[0]?.receiver).toBe("payee@example.com");
    expect(payout.items[0]?.amount).toEqual({ value: "1.00", currency: "USD" });
  });
});
