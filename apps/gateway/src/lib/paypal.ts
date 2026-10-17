import {
  createPayPalClient,
  type PayPalClient,
  type PayoutBatch,
  type VerifyWebhookInput,
} from "@kitty/paypal";
import { env } from "../env";
import { AppError } from "./errors";
import { logger } from "./logger";

let client: PayPalClient | undefined;

/**
 * Lazily builds the single PayPal REST client the gateway uses.
 *
 * This lives in `apps/gateway` on purpose: it is the only service allowed to
 * hold PayPal credentials and call the PayPal API (AGENTS.md invariant #1). The
 * client is created once and cached; every call goes through it.
 */
export function getPayPalClient(): PayPalClient {
  if (env.PAYPAL_CLIENT_ID === undefined || env.PAYPAL_CLIENT_SECRET === undefined) {
    throw new AppError("PAYPAL_NOT_CONFIGURED", 503, {
      hint: "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in apps/gateway/.env.",
    });
  }

  client ??= createPayPalClient({
    env: env.PAYPAL_ENV,
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    logger,
  });

  return client;
}

/** The single Payouts call the reserve/execute flow needs (docs/11 §2.3). */
export interface PayoutExecutor {
  createPayout(input: {
    /** Idempotency key; also the PayPal `sender_batch_id`. */
    readonly requestId: string;
    readonly payeeEmail: string;
    readonly amountCents: bigint;
    readonly currency: string;
    readonly note: string;
  }): Promise<{ readonly batchId: string; readonly status: string }>;
}

/** Adapts the PayPal client to {@link PayoutExecutor}. */
export function getPayoutExecutor(): PayoutExecutor {
  const paypal = getPayPalClient();

  return {
    async createPayout(input) {
      const result = await paypal.payouts.createSingle({
        requestId: input.requestId,
        senderBatchId: input.requestId,
        // The item lookup key for `PAYMENT.PAYOUTS-ITEM.*` webhooks
        // (docs/11 §3): with one intent per batch the intent id is both.
        senderItemId: input.requestId,
        payeeEmail: input.payeeEmail,
        amountCents: input.amountCents,
        currency: input.currency,
        note: input.note,
      });

      return { batchId: result.batchId, status: result.status };
    },
  };
}

/** Signature verification of an inbound webhook (docs/10 §5 step 2). */
export interface WebhookVerifier {
  verify(input: VerifyWebhookInput): Promise<boolean>;
}

/** Adapts the PayPal client to {@link WebhookVerifier}. */
export function getWebhookVerifier(): WebhookVerifier {
  const paypal = getPayPalClient();

  return {
    verify: (input) => paypal.webhooks.verifySignature(input),
  };
}

/** Reads a payout batch back from PayPal, for the reconcile sweep (docs/10 §6). */
export interface PayoutStatusReader {
  getBatch(input: { readonly batchId: string }): Promise<PayoutBatch>;
}

/** Adapts the PayPal client to {@link PayoutStatusReader}. */
export function getPayoutStatusReader(): PayoutStatusReader {
  const paypal = getPayPalClient();

  return {
    getBatch: (input) => paypal.payouts.getBatch({ batchId: input.batchId }),
  };
}
