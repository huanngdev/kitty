import type { SpendIntentStatus } from "@kitty/db/schema";
import { type Decision, type SpendIntent, evaluate } from "@kitty/leash";
import { release, reserve } from "@kitty/ledger";
import { PayPalApiError, toPayPalApiError } from "@kitty/paypal";
import { idPrefixes, type ExecuteOutcome, type IntentView } from "@kitty/shared";
import { AppError } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { logger } from "../../lib/logger";
import { centsToWire } from "../../lib/money";
import type { PayoutExecutor } from "../../lib/paypal";
import { isDecisionOutcome, parseReasons, toDomainLeash } from "./mappers";
import { payloadHash } from "./payload";
import type { IntentsStore } from "./intents.repository";
import { SPENT_WINDOW_MS, summarizeUsage } from "./usage";

/**
 * Reserve + execute of a spend intent (docs/05 §7, docs/10 §6, docs/11 §2.3).
 *
 * `reserveIntent` performs the whole policy decision inside one Postgres
 * transaction (lock → usage → evaluate → insert → reserve). `executeIntent`
 * calls PayPal **outside** any transaction that holds row locks, then records
 * the outcome. Money is always integer cents (AGENTS.md invariant #4).
 */

/** Step-up approvals are valid for 15 minutes (docs/05 §10). */
export const APPROVAL_TTL_MS = 15 * 60 * 1000;

/** The three stored decisions, mapped to the intent status they land in. */
export function decisionToStatus(decision: Decision): SpendIntentStatus {
  switch (decision.outcome) {
    case "ALLOW":
      return "reserved";
    case "STEP_UP":
      return "awaiting_approval";
    case "DENY":
      return "denied";
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

/**
 * True when a PayPal failure is definitive, so the hold must be returned.
 *
 * The transport already retried 429/5xx/network internally, so a
 * `PayPalApiError` that reaches us is either a non-retryable 4xx (PayPal
 * rejected the request) or an exhausted/unknown outcome. A 401 (auth),
 * 408 (timeout) or 429 (rate limit) is **not** a rejection of the payout
 * itself, so it stays retryable (docs/11 §4).
 */
export function isDefinitivePayPalFailure(error: PayPalApiError): boolean {
  const status = error.status;

  if (status === undefined) {
    return false;
  }

  if (status === 401 || status === 408 || status === 429) {
    return false;
  }

  return status >= 400 && status < 500;
}

export interface ReserveIntentArgs {
  readonly agentId: string;
  /** Domain spend intent from `@kitty/leash` (wire parsing is the caller's job). */
  readonly request: SpendIntent;
  /** Signed-body hash, when the caller has one; defaults to the payload hash. */
  readonly requestHash?: string;
}

export interface ExecuteIntentResult {
  readonly intentId: string;
  readonly status: SpendIntentStatus;
  readonly outcome: ExecuteOutcome;
  readonly paypalRef: string | null;
  readonly attempts: number;
}

export interface ReserveIntentResult {
  readonly intentId: string;
  readonly leashId: string;
  readonly decision: Decision;
  readonly status: SpendIntentStatus;
  /** True when an existing intent row was returned unchanged. */
  readonly replayed: boolean;
  /** Result of the in-process execution after an ALLOW, when it ran. */
  readonly execution: ExecuteIntentResult | null;
}

export interface IntentsService {
  reserveIntent(args: ReserveIntentArgs): Promise<ReserveIntentResult>;
  executeIntent(intentId: string): Promise<ExecuteIntentResult>;
  getIntent(intentId: string): Promise<IntentView | null>;
}

export interface IntentsServiceDeps {
  readonly store: IntentsStore;
  readonly payouts: PayoutExecutor;
  readonly now: () => Date;
}

function toIntentView(input: {
  intent: {
    id: string;
    leashId: string;
    agentId: string;
    action: string;
    amountCents: bigint;
    currency: string;
    payee: string | null;
    category: string | null;
    memo: string;
    taskId: string | null;
    decision: string;
    reasons: unknown;
    status: SpendIntentStatus;
    paypalRef: string | null;
    executeAttempts: number;
    error: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
  kittyId: string;
}): IntentView {
  const { intent } = input;

  if (!isDecisionOutcome(intent.decision)) {
    throw new AppError("INTENT_ROW_INVALID", 500, { intentId: intent.id });
  }

  return {
    intentId: intent.id,
    leashId: intent.leashId,
    kittyId: input.kittyId,
    agentId: intent.agentId,
    action: intent.action,
    amount: centsToWire(intent.amountCents),
    currency: intent.currency,
    payee: intent.payee,
    category: intent.category,
    memo: intent.memo,
    taskId: intent.taskId,
    decision: intent.decision,
    reasons: parseReasons(intent.reasons),
    status: intent.status,
    paypalRef: intent.paypalRef,
    executeAttempts: intent.executeAttempts,
    error: intent.error,
    createdAt: intent.createdAt.toISOString(),
    updatedAt: intent.updatedAt.toISOString(),
  };
}

export function createIntentsService(deps: IntentsServiceDeps): IntentsService {
  async function executeIntent(intentId: string): Promise<ExecuteIntentResult> {
    // Phase A — claim: lock the reserved intent (SKIP LOCKED), bump the attempt
    // counter and read the leash's kitty. Short transaction, no network.
    const claim = await deps.store.transaction(async (tx) => {
      const locked = await tx.lockReservedIntent(intentId);

      if (locked === null) {
        const record = await tx.findIntentById(intentId);

        return { kind: "noop" as const, record };
      }

      await tx.incrementExecuteAttempts(intentId);

      return {
        kind: "claimed" as const,
        intent: locked,
        kittyId: await tx.kittyIdOfLeash(locked.leashId),
      };
    });

    if (claim.kind === "noop") {
      if (claim.record === null) {
        throw new AppError("INTENT_NOT_FOUND", 404, { intentId });
      }

      return {
        intentId,
        status: claim.record.intent.status,
        outcome: "noop",
        paypalRef: claim.record.intent.paypalRef,
        attempts: claim.record.intent.executeAttempts,
      };
    }

    const intent = claim.intent;
    const attempts = intent.executeAttempts + 1;

    if (claim.kittyId === null) {
      throw new AppError("INTENT_LEASH_MISSING", 500, { intentId, leashId: intent.leashId });
    }
    const kittyId = claim.kittyId;

    // Only payouts execute in this task; other actions are recorded and left
    // reserved for the follow-up task that implements them.
    if (intent.action !== "payout") {
      const error = {
        code: "NOT_IMPLEMENTED",
        message: `action "${intent.action}" is not executed by the gateway yet`,
        action: intent.action,
      };
      await deps.store.transaction(async (tx) => tx.setLastExecuteError(intentId, error));

      return {
        intentId,
        status: intent.status,
        outcome: "not_implemented",
        paypalRef: intent.paypalRef,
        attempts,
      };
    }

    // Phase B — call PayPal with NO transaction open (docs/11 §4: request id =
    // sender batch id = intentId, so a retry can never double-pay).
    let success: { batchId: string; status: string } | null = null;
    let failure: PayPalApiError | null = null;

    try {
      success = await deps.payouts.createPayout({
        requestId: intentId,
        payeeEmail: intent.payee ?? "",
        amountCents: intent.amountCents,
        currency: intent.currency,
        note: intent.memo,
      });
    } catch (error) {
      failure = toPayPalApiError(error);
    }

    if (success !== null) {
      const batchId = success.batchId;
      const batchStatus = success.status;

      await deps.store.transaction(async (tx) => {
        const updated = await tx.updateIntentAfterExecute(intentId, {
          status: "submitted",
          paypalRef: batchId,
          error: null,
        });

        if (!updated) {
          logger.warn({ intentId }, "intent changed while executing; PayPal ran once");
          return;
        }

        await tx.upsertPaypalObject({
          id: batchId,
          kind: "payout_batch",
          intentId,
          kittyId,
          status: batchStatus,
          raw: {
            batchId,
            status: batchStatus,
            amount: centsToWire(intent.amountCents),
            currency: intent.currency,
          },
        });
        await tx.insertAuditEvent({
          kittyId,
          actor: "system",
          type: "intent.submitted",
          data: { intentId, leashId: intent.leashId, batchId, batchStatus },
        });
        await tx.insertOutboxEvent({
          kittyId,
          type: "intent.submitted",
          payload: { intentId, leashId: intent.leashId, batchId, batchStatus },
        });
      });

      return { intentId, status: "submitted", outcome: "submitted", paypalRef: batchId, attempts };
    }

    const error = failure ?? toPayPalApiError(new Error("PayPal call threw no error"));

    if (isDefinitivePayPalFailure(error)) {
      const errorPayload = {
        code: "PAYPAL_REJECTED",
        status: error.status ?? null,
        paypalName: error.paypalName ?? null,
        message: error.message,
        issueCodes: [...error.issueCodes],
      };

      await deps.store.transaction(async (tx) => {
        const updated = await tx.updateIntentAfterExecute(intentId, {
          status: "released",
          error: errorPayload,
        });

        if (!updated) {
          logger.warn({ intentId }, "intent changed while releasing the hold");
          return;
        }

        await tx.insertLedgerEntry({
          kittyId,
          txn: release({
            txnId: `txn_release_${intentId}`,
            leashId: intent.leashId,
            amountCents: intent.amountCents,
            intentId,
          }),
        });
        await tx.insertAuditEvent({
          kittyId,
          actor: "system",
          type: "intent.released",
          data: { intentId, leashId: intent.leashId, reason: "paypal_rejected", ...errorPayload },
        });
        await tx.insertOutboxEvent({
          kittyId,
          type: "intent.failed",
          payload: {
            intentId,
            leashId: intent.leashId,
            reason: "paypal_rejected",
            status: error.status ?? null,
          },
        });
      });

      return {
        intentId,
        status: "released",
        outcome: "failed_released",
        paypalRef: intent.paypalRef,
        attempts,
      };
    }

    // Unknown outcome: stay reserved so a retry is safe (PayPal dedupes on the
    // request id). The error is recorded for the reconcile sweep.
    const errorPayload = {
      code: "PAYPAL_UNKNOWN_OUTCOME",
      status: error.status ?? null,
      paypalName: error.paypalName ?? null,
      message: error.message,
    };
    await deps.store.transaction(async (tx) => tx.setLastExecuteError(intentId, errorPayload));

    return {
      intentId,
      status: "reserved",
      outcome: "unknown",
      paypalRef: intent.paypalRef,
      attempts,
    };
  }

  async function reserveIntent(args: ReserveIntentArgs): Promise<ReserveIntentResult> {
    const now = deps.now();
    const hash = await payloadHash(args.request);

    const outcome = await deps.store.transaction(async (tx) => {
      const findReplay = async (
        record: NonNullable<Awaited<ReturnType<typeof tx.findIntentById>>>,
      ): Promise<{ kind: "replay"; result: ReserveIntentResult }> => {
        const active = await tx.findActiveLeashForAgent(args.agentId);

        if (active !== null && active.id !== record.intent.leashId) {
          throw new AppError("INTENT_ID_CONFLICT", 409, {
            intentId: args.request.intentId,
            reason: "leash_mismatch",
          });
        }

        if (record.intent.payloadHash !== null && record.intent.payloadHash !== hash) {
          throw new AppError("INTENT_ID_CONFLICT", 409, {
            intentId: args.request.intentId,
            reason: "payload_hash_mismatch",
          });
        }

        if (!isDecisionOutcome(record.intent.decision)) {
          throw new AppError("INTENT_ROW_INVALID", 500, {
            intentId: args.request.intentId,
          });
        }

        return {
          kind: "replay",
          result: {
            intentId: record.intent.id,
            leashId: record.intent.leashId,
            decision:
              record.intent.decision === "ALLOW"
                ? { outcome: "ALLOW" }
                : {
                    outcome: record.intent.decision,
                    reasons: parseReasons(record.intent.reasons),
                  },
            status: record.intent.status,
            replayed: true,
            execution: null,
          },
        };
      };

      // Idempotency first: an existing row is returned unchanged.
      const existing = await tx.findIntentById(args.request.intentId);
      if (existing !== null) {
        return findReplay(existing);
      }

      const leash = await tx.findActiveLeashForAgent(args.agentId);
      if (leash === null) {
        throw new AppError("LEASH_NOT_FOUND", 404, { agentId: args.agentId });
      }

      const ancestors = await tx.findAncestorChain(leash.id);
      await tx.lockLeashes([leash.id, ...ancestors.map((ancestor) => ancestor.id)]);

      // Re-check under the lock: a concurrent request may have inserted it.
      const afterLock = await tx.findIntentById(args.request.intentId);
      if (afterLock !== null) {
        return findReplay(afterLock);
      }

      const since = new Date(now.getTime() - SPENT_WINDOW_MS);
      const [kittyLeashes, intentRows, balances] = await Promise.all([
        tx.listLeashesForKitty(leash.kittyId),
        tx.listIntentUsageRows(leash.kittyId, since),
        tx.listLeashBalances(leash.kittyId),
      ]);

      const { usage, ancestorUsage } = summarizeUsage({
        targetLeashId: leash.id,
        ancestors: ancestors.map((ancestor) => ({
          id: ancestor.id,
          parentId: ancestor.parentId,
        })),
        leashes: kittyLeashes,
        intents: intentRows,
        balances,
        now,
      });

      const decision = evaluate({
        leash: toDomainLeash(leash),
        ancestors: ancestors.map(toDomainLeash),
        intent: args.request,
        usage,
        ancestorUsage,
        now: now.toISOString(),
      });

      const status = decisionToStatus(decision);
      const inserted = await tx.insertIntent({
        id: args.request.intentId,
        leashId: leash.id,
        agentId: args.agentId,
        action: args.request.action,
        amountCents: args.request.amountCents,
        currency: args.request.currency,
        payee: args.request.payee ?? null,
        category: args.request.category ?? null,
        memo: args.request.memo,
        taskId: args.request.taskId ?? null,
        justification: args.request.justification,
        requestHash: args.requestHash ?? hash,
        payloadHash: hash,
        decision: decision.outcome,
        reasons: decision.outcome === "ALLOW" ? [] : decision.reasons,
        status,
      });

      if (!inserted) {
        // Lost an insert race: return the winner's stored decision.
        const raced = await tx.findIntentById(args.request.intentId);
        if (raced === null) {
          throw new AppError("INTENT_INSERT_FAILED", 500, { intentId: args.request.intentId });
        }

        return findReplay(raced);
      }

      if (status !== "denied") {
        await tx.insertLedgerEntry({
          kittyId: leash.kittyId,
          txn: reserve({
            txnId: `txn_reserve_${args.request.intentId}`,
            leashId: leash.id,
            amountCents: args.request.amountCents,
            intentId: args.request.intentId,
          }),
        });
      }

      if (decision.outcome === "STEP_UP") {
        await tx.insertApproval({
          id: newId(idPrefixes.approval),
          intentId: args.request.intentId,
          kittyId: leash.kittyId,
          status: "pending",
          expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
        });
      }

      await tx.insertAuditEvent({
        kittyId: leash.kittyId,
        actor: `agent:${args.agentId}`,
        type: "intent.decided",
        data: {
          intentId: args.request.intentId,
          leashId: leash.id,
          decision: decision.outcome,
          status,
          amount: centsToWire(args.request.amountCents),
        },
      });
      await tx.insertOutboxEvent({
        kittyId: leash.kittyId,
        type: "intent.decided",
        payload: {
          intentId: args.request.intentId,
          leashId: leash.id,
          decision: decision.outcome,
          status,
        },
      });

      return {
        kind: "fresh" as const,
        result: {
          intentId: args.request.intentId,
          leashId: leash.id,
          decision,
          status,
          replayed: false,
          execution: null,
        } satisfies ReserveIntentResult,
      };
    });

    if (outcome.kind === "replay") {
      return outcome.result;
    }

    // After commit: an ALLOW executes in-process. Execution errors are recorded
    // on the intent and never thrown back to the agent (docs/05 §7).
    if (outcome.result.status !== "reserved") {
      return outcome.result;
    }

    let execution: ExecuteIntentResult | null = null;

    try {
      execution = await executeIntent(outcome.result.intentId);
    } catch (error) {
      logger.error(
        { err: error, intentId: outcome.result.intentId },
        "in-process execution failed",
      );
    }

    return {
      ...outcome.result,
      status: execution?.status ?? outcome.result.status,
      execution,
    };
  }

  async function getIntent(intentId: string): Promise<IntentView | null> {
    const record = await deps.store.transaction(async (tx) => tx.findIntentById(intentId));

    if (record === null) {
      return null;
    }

    return toIntentView({ intent: record.intent, kittyId: record.kittyId });
  }

  return { reserveIntent, executeIntent, getIntent };
}
