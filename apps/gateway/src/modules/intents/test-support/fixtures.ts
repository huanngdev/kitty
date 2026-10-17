import type { SpendIntent } from "@kitty/leash";
import { PayPalApiError } from "@kitty/paypal";
import { idPrefixes } from "@kitty/shared";
import { newId } from "../../../lib/ids";
import type { PayoutExecutor } from "../../../lib/paypal";

/** Builds a domain spend intent with test-friendly defaults. */
export function spendIntent(overrides: Partial<SpendIntent> = {}): SpendIntent {
  return {
    intentId: newId(idPrefixes.spendIntent),
    action: "payout",
    amountCents: 1_000n,
    currency: "USD",
    payee: "vendor@example.com",
    category: "lodging",
    memo: "Deposit for Pine Hill Homestay",
    justification: "agent's claim",
    ...overrides,
  };
}

export interface FakePayouts {
  readonly executor: PayoutExecutor;
  readonly calls: readonly {
    requestId: string;
    payeeEmail: string;
    amountCents: bigint;
    currency: string;
    note: string;
  }[];
  /** Switches the executor into failure mode for the next calls. */
  failWith(error: unknown): void;
  succeedWith(result: { batchId: string; status: string }): void;
}

/**
 * Fake {@link PayoutExecutor} that records every call. Default behaviour is a
 * successful batch; tests switch it to throw a specific PayPal error.
 */
export function createFakePayouts(): FakePayouts {
  const calls: {
    requestId: string;
    payeeEmail: string;
    amountCents: bigint;
    currency: string;
    note: string;
  }[] = [];

  let next:
    | { kind: "success"; value: { batchId: string; status: string } }
    | { kind: "failure"; value: unknown } = {
    kind: "success",
    value: { batchId: "BATCH-1", status: "PENDING" },
  };

  const executor: PayoutExecutor = {
    async createPayout(input) {
      calls.push({
        requestId: input.requestId,
        payeeEmail: input.payeeEmail,
        amountCents: input.amountCents,
        currency: input.currency,
        note: input.note,
      });

      if (next.kind === "failure") {
        throw next.value;
      }

      return next.value;
    },
  };

  return {
    executor,
    calls,
    failWith(error) {
      next = { kind: "failure", value: error };
    },
    succeedWith(value) {
      next = { kind: "success", value };
    },
  };
}

/** A PayPal 4xx rejection (non-retryable → release the hold). */
export function paypalRejection(status = 422): PayPalApiError {
  return new PayPalApiError({
    status,
    paypalName: "INVALID_REQUEST",
    message: "Receiver is invalid",
    debugId: "debug-1",
    issueCodes: ["INVALID_RECEIVER"],
    details: [],
  });
}

/** A network failure / exhausted retry (unknown outcome → stay reserved). */
export function paypalNetworkFailure(): PayPalApiError {
  return new PayPalApiError({
    status: undefined,
    paypalName: undefined,
    message: "PayPal request failed before a response",
    debugId: undefined,
    issueCodes: [],
    details: [],
  });
}
