import type { Db, LeashRow, SpendIntentRow } from "@kitty/db";
import { evaluate, type SpendIntent } from "@kitty/leash";
import {
  type LeashActivityItem,
  type LeashActivityOutput,
  type LeashCheckInput,
  type LeashCheckOutput,
  type LeashIntentStatusOutput,
  type LeashRequestPayoutInput,
  type LeashRequestPayoutOutput,
  type LeashStatusOutput,
} from "@kitty/shared/leash-agent";
import { AppError } from "../../lib/errors";
import { centsToWire, wireToCents } from "../../lib/money";
import * as auditRepo from "../audit/audit.repository";
import type { IntentsService } from "../intents";
import { isDecisionOutcome, parseReasons, toDomainLeash } from "../intents/mappers";
import { SPENT_WINDOW_MS, summarizeUsage } from "../intents/usage";
import {
  findActiveLeashByAgent,
  leashBalance,
  leashBalancesByKitty,
  spent24hCents,
} from "../leashes/leashes.repository";
import * as repo from "./agent-leash.repository";

/**
 * Business logic of the agent-facing MCP tools (docs/10 §2, docs/05 §13).
 *
 * Every read and write is scoped to the **active leash of the authenticated
 * agent** — the agent never supplies a `leashId`, so it cannot reach another
 * agent's leash (AGENTS.md invariant #9, docs/10 §2). Money is integer cents
 * inside, a decimal string only on the wire (AGENTS.md invariant #4).
 *
 * `leash_request_payout` reuses the KIT-16 reserve/execute service so the agent
 * path and the internal path run the exact same policy and ledger code.
 */

export interface AgentLeashServiceDeps {
  readonly db: Db;
  readonly intents: IntentsService;
  readonly now: () => Date;
}

export interface AgentLeashService {
  getStatus(agentId: string): Promise<LeashStatusOutput>;
  check(agentId: string, input: LeashCheckInput): Promise<LeashCheckOutput>;
  requestPayout(agentId: string, input: LeashRequestPayoutInput): Promise<LeashRequestPayoutOutput>;
  getIntentStatus(agentId: string, intentId: string): Promise<LeashIntentStatusOutput>;
  listActivity(agentId: string, limit: number): Promise<LeashActivityOutput>;
}

interface ActiveLeash {
  readonly leash: LeashRow;
  readonly kittyId: string;
}

async function requireActiveLeash(
  deps: AgentLeashServiceDeps,
  agentId: string,
): Promise<ActiveLeash> {
  const leash = await findActiveLeashByAgent(deps.db, agentId);

  if (leash === undefined) {
    throw new AppError("LEASH_NOT_FOUND", 404, { agentId });
  }

  return { leash, kittyId: leash.kittyId };
}

function toActivityItem(row: SpendIntentRow): LeashActivityItem {
  if (!isDecisionOutcome(row.decision)) {
    throw new AppError("INTENT_ROW_INVALID", 500, { intentId: row.id });
  }

  return {
    intentId: row.id,
    action: row.action,
    amount: centsToWire(row.amountCents),
    currency: row.currency,
    payee: row.payee,
    memo: row.memo,
    justification: row.justification,
    decision: row.decision,
    reasons: parseReasons(row.reasons),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createAgentLeashService(deps: AgentLeashServiceDeps): AgentLeashService {
  async function getStatus(agentId: string): Promise<LeashStatusOutput> {
    const { leash, kittyId } = await requireActiveLeash(deps, agentId);
    const domain = toDomainLeash(leash);
    const [balance, spent24h] = await Promise.all([
      leashBalance(deps.db, kittyId, leash.id),
      spent24hCents(deps.db, leash.id),
    ]);

    return {
      leashId: domain.id,
      status: domain.status,
      currency: domain.currency,
      allocation: centsToWire(domain.allocationCents),
      available: centsToWire(balance.availableCents),
      held: centsToWire(balance.heldCents),
      spent24h: centsToWire(spent24h),
      limits: {
        perTxMax: centsToWire(domain.limits.perTxMaxCents),
        dailyMax: centsToWire(domain.limits.dailyMaxCents),
        maxTxPerHour: domain.limits.maxTxPerHour,
      },
      allowedActions: [...domain.allowedActions],
      allowedPayees: [...domain.allowedPayees],
      allowedCategories: [...domain.allowedCategories],
      stepUpAbove: domain.stepUpAboveCents === null ? null : centsToWire(domain.stepUpAboveCents),
      expiresAt: domain.expiresAt,
    };
  }

  async function check(agentId: string, input: LeashCheckInput): Promise<LeashCheckOutput> {
    const { leash, kittyId } = await requireActiveLeash(deps, agentId);
    const now = deps.now();
    const request: SpendIntent = {
      // `check` stores no intent, so the id is only used to skip self-matching
      // in duplicate detection; the empty id can never match a stored intent.
      intentId: "",
      action: input.action,
      amountCents: wireToCents(input.amount, "amount"),
      currency: input.currency,
      payee: input.payee,
      category: input.category,
      memo: input.memo,
      taskId: input.taskId,
      // Present for completeness; `evaluate` never reads it (AGENTS.md #2).
      justification: input.justification,
    };

    const [ancestors, kittyLeashes, intentRows, balances] = await Promise.all([
      repo.findAncestorChain(deps.db, leash.id),
      repo.listLeashIdentities(deps.db, kittyId),
      repo.listIntentUsageRows(deps.db, kittyId, new Date(now.getTime() - SPENT_WINDOW_MS)),
      leashBalancesByKitty(deps.db, kittyId),
    ]);

    const { usage, ancestorUsage } = summarizeUsage({
      targetLeashId: leash.id,
      ancestors: ancestors.map((ancestor) => ({ id: ancestor.id, parentId: ancestor.parentId })),
      leashes: kittyLeashes,
      intents: intentRows,
      balances,
      now,
    });

    const decision = evaluate({
      leash: toDomainLeash(leash),
      ancestors: ancestors.map(toDomainLeash),
      intent: request,
      usage,
      ancestorUsage,
      now: now.toISOString(),
    });

    const reasons = decision.outcome === "ALLOW" ? [] : decision.reasons;

    await auditRepo.insertAuditEvent(deps.db, {
      kittyId,
      actor: `agent:${agentId}`,
      type: "intent.check",
      data: {
        leashId: leash.id,
        action: request.action,
        amount: centsToWire(request.amountCents),
        currency: request.currency,
        payee: request.payee ?? null,
        category: request.category ?? null,
        decision: decision.outcome,
        reasons,
      },
    });

    return { decision: decision.outcome, reasons };
  }

  async function requestPayout(
    agentId: string,
    input: LeashRequestPayoutInput,
  ): Promise<LeashRequestPayoutOutput> {
    const { kittyId } = await requireActiveLeash(deps, agentId);
    const request: SpendIntent = {
      intentId: input.intentId,
      action: "payout",
      amountCents: wireToCents(input.amount, "amount"),
      currency: "USD",
      payee: input.payee,
      category: input.category,
      memo: input.memo,
      taskId: input.taskId,
      // Stored on the intent for audit; never an input to `evaluate` (#2).
      justification: input.justification,
    };

    const result = await deps.intents.reserveIntent({ agentId, request });
    const reasons = result.decision.outcome === "ALLOW" ? [] : result.decision.reasons;
    const approval =
      result.decision.outcome === "STEP_UP"
        ? await repo.findApprovalByIntentId(deps.db, result.intentId)
        : null;
    const balance = await leashBalance(deps.db, kittyId, result.leashId);

    return {
      intentId: result.intentId,
      decision: result.decision.outcome,
      status: result.status,
      reasons,
      approvalId: approval?.id ?? null,
      available: centsToWire(balance.availableCents),
    };
  }

  async function getIntentStatus(
    agentId: string,
    intentId: string,
  ): Promise<LeashIntentStatusOutput> {
    const { leash } = await requireActiveLeash(deps, agentId);
    const intent = await repo.findIntentForLeash(deps.db, intentId, leash.id);

    if (intent === null) {
      throw new AppError("INTENT_NOT_FOUND", 404, { intentId });
    }

    if (!isDecisionOutcome(intent.decision)) {
      throw new AppError("INTENT_ROW_INVALID", 500, { intentId });
    }

    const paypal = await repo.findPaypalObjectForIntent(deps.db, intentId);

    return {
      intentId: intent.id,
      leashId: intent.leashId,
      action: intent.action,
      amount: centsToWire(intent.amountCents),
      currency: intent.currency,
      payee: intent.payee,
      category: intent.category,
      memo: intent.memo,
      taskId: intent.taskId,
      justification: intent.justification,
      decision: intent.decision,
      reasons: parseReasons(intent.reasons),
      status: intent.status,
      paypalRef: intent.paypalRef,
      paypalStatus: paypal?.status ?? null,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    };
  }

  async function listActivity(agentId: string, limit: number): Promise<LeashActivityOutput> {
    const { leash } = await requireActiveLeash(deps, agentId);
    const rows = await repo.listRecentIntentsForLeash(deps.db, leash.id, limit);

    return { items: rows.map(toActivityItem) };
  }

  return { getStatus, check, requestPayout, getIntentStatus, listActivity };
}
