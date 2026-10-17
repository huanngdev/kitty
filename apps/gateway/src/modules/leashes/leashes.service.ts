import type { Db, LeashRow, SpendIntentRow } from "@kitty/db";
import { ACTIONS } from "@kitty/leash";
import {
  allocateLeash,
  kittyAvailable,
  leashAvailable,
  revokeLeash as revokeLeashTxn,
} from "@kitty/ledger";
import { errorCodes, idPrefixes } from "@kitty/shared";
import {
  type CreateLeashInput,
  type Leash,
  type LeashDetail,
  type LeashListItem,
  type ListIntentsQuery,
  type SpendIntent,
  type TopupLeashInput,
} from "@kitty/shared/leash-admin";
import { AppError } from "../../lib/errors";
import { newId, newTxnId } from "../../lib/ids";
import { postLedgerTxn } from "../../lib/ledger";
import { centsToWire } from "../../lib/money";
import { narrowEnum } from "../../lib/narrow";
import { requireOwnedKitty } from "../../lib/ownership";
import * as agentsRepo from "../agents/agents.repository";
import * as auditRepo from "../audit/audit.repository";
import * as kittiesRepo from "../kitties/kitties.repository";
import * as payeesRepo from "../payees/payees.repository";
import * as repo from "./leashes.repository";
import type { LeashBalanceCents } from "./leashes.repository";
import {
  assertLeashTransition,
  resolveAllowedPayees,
  validateCreateLeashSpec,
  validateTopupAmount,
} from "./leashes.validation";

/**
 * Leash service (docs/10-api-spec.md §1, docs/05-leash-spec.md §2/§8/§9/§11).
 *
 * Every money movement (create, top-up, revoke) runs in one transaction with
 * row locks: the kitty available balance is the ceiling, the ledger builders of
 * `@kitty/ledger` post the movement, and an audit row is written in the same
 * commit (AGENTS.md invariants #5, #6, #12).
 */

/** Default page size for the intents list. */
const DEFAULT_INTENTS_LIMIT = 100;

export function toLeash(row: LeashRow): Leash {
  return {
    id: row.id,
    kittyId: row.kittyId,
    parentId: row.parentId,
    agentId: row.agentId,
    currency: row.currency,
    allocation: centsToWire(row.allocationCents),
    limits: {
      perTxMax: centsToWire(row.perTxMaxCents),
      dailyMax: centsToWire(row.dailyMaxCents),
      maxTxPerHour: row.maxTxPerHour,
    },
    allowedActions: row.allowedActions.map((action) =>
      narrowEnum(action, ACTIONS, "leash.actions"),
    ),
    allowedPayees: row.allowedPayees,
    allowedCategories: row.allowedCategories,
    stepUpAbove: row.stepUpAboveCents === null ? null : centsToWire(row.stepUpAboveCents),
    notBefore: row.notBefore.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toUsage(balance: LeashBalanceCents): { available: string; held: string } {
  return {
    available: centsToWire(balance.availableCents),
    held: centsToWire(balance.heldCents),
  };
}

export function toLeashListItem(row: LeashRow, balance: LeashBalanceCents): LeashListItem {
  return { ...toLeash(row), usage: toUsage(balance) };
}

function toLeashDetail(
  row: LeashRow,
  balance: LeashBalanceCents,
  spent24hCents: bigint,
  children: readonly LeashRow[],
): LeashDetail {
  return {
    ...toLeash(row),
    available: centsToWire(balance.availableCents),
    held: centsToWire(balance.heldCents),
    spent24h: centsToWire(spent24hCents),
    children: children.map((child) => toLeash(child)),
  };
}

export function toSpendIntent(row: SpendIntentRow): SpendIntent {
  return {
    id: row.id,
    leashId: row.leashId,
    agentId: row.agentId,
    action: row.action,
    amount: centsToWire(row.amountCents),
    currency: row.currency,
    payee: row.payee,
    category: row.category,
    memo: row.memo,
    taskId: row.taskId,
    decision: narrowEnum(row.decision, ["ALLOW", "DENY", "STEP_UP"] as const, "intent.decision"),
    status: row.status,
    paypalRef: row.paypalRef,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface LeashList {
  readonly items: LeashListItem[];
}

export interface IntentList {
  readonly items: SpendIntent[];
}

async function requireLeash(db: Db, leashId: string): Promise<LeashRow> {
  const leash = await repo.findLeashById(db, leashId);

  if (leash === undefined) {
    throw new AppError(errorCodes.leashNotFound, 404, { leashId });
  }

  return leash;
}

export async function createLeash(
  db: Db,
  input: CreateLeashInput,
  actorUserId: string,
): Promise<LeashListItem> {
  const kitty = requireOwnedKitty(await kittiesRepo.findKittyById(db, input.kittyId), actorUserId);

  const agent = await agentsRepo.findAgentById(db, input.agentId);

  if (agent === undefined || agent.kittyId !== kitty.id) {
    throw new AppError(errorCodes.agentNotFound, 404, { agentId: input.agentId });
  }

  const verifiedPayees = await payeesRepo.verifiedPayeeEmails(db, kitty.id);
  const leashId = newId(idPrefixes.leash);

  const inserted = await db.transaction(async (tx) => {
    // Lock the kitty and agent rows first so concurrent creates serialize and
    // can never draw more than the kitty has available (docs/05 §7).
    await kittiesRepo.findKittyByIdForUpdate(tx, kitty.id);
    await agentsRepo.findAgentByIdForUpdate(tx, input.agentId);

    const availableCents = await kittiesRepo.kittyAvailableCents(tx, kitty.id);
    const activeLeash = await repo.findActiveLeashByAgent(tx, input.agentId);

    const spec = validateCreateLeashSpec(input, {
      kittyAvailableCents: availableCents,
      verifiedPayees,
      hasActiveLeashForAgent: activeLeash !== undefined,
      now: new Date(),
    });

    const row = await repo.insertLeash(tx, {
      id: leashId,
      kittyId: kitty.id,
      parentId: null,
      agentId: input.agentId,
      currency: kitty.currency,
      allocationCents: spec.allocationCents,
      perTxMaxCents: spec.perTxMaxCents,
      dailyMaxCents: spec.dailyMaxCents,
      maxTxPerHour: spec.maxTxPerHour,
      allowedActions: [...input.allowedActions],
      allowedPayees: spec.allowedPayees,
      allowedCategories: [...input.allowedCategories],
      stepUpAboveCents: spec.stepUpAboveCents,
      notBefore: spec.notBefore,
      expiresAt: spec.expiresAt,
      status: "active",
      createdBy: actorUserId,
    });

    if (spec.allocationCents > 0n) {
      await postLedgerTxn(
        tx,
        allocateLeash({
          txnId: newTxnId(),
          kittyId: kitty.id,
          leashId,
          amountCents: spec.allocationCents,
        }),
        kitty.id,
      );
    }

    await auditRepo.insertAuditEvent(tx, {
      kittyId: kitty.id,
      actor: `user:${actorUserId}`,
      type: "leash.created",
      data: {
        leashId,
        agentId: input.agentId,
        allocation: centsToWire(spec.allocationCents),
        allowedActions: [...input.allowedActions],
        allowedPayees: spec.allowedPayees,
      },
    });

    return row;
  });

  const balance = await repo.leashBalance(db, kitty.id, leashId);

  return toLeashListItem(inserted, balance);
}

export async function topupLeash(
  db: Db,
  leashId: string,
  input: TopupLeashInput,
  actorUserId: string,
): Promise<LeashListItem> {
  const leash = await requireLeash(db, leashId);
  const kitty = requireOwnedKitty(await kittiesRepo.findKittyById(db, leash.kittyId), actorUserId);
  const verifiedPayees = await payeesRepo.verifiedPayeeEmails(db, kitty.id);

  const updated = await db.transaction(async (tx) => {
    await kittiesRepo.findKittyByIdForUpdate(tx, kitty.id);

    const locked = await repo.findLeashByIdForUpdate(tx, leashId);

    if (locked === undefined) {
      throw new AppError(errorCodes.leashNotFound, 404, { leashId });
    }

    assertLeashTransition(locked.status, "topup");
    // A payee removed since creation must be re-verified before more money is
    // granted (AGENTS.md invariant #12).
    resolveAllowedPayees(locked.allowedPayees, locked.allowedActions, verifiedPayees);

    const availableCents = await kittiesRepo.kittyAvailableCents(tx, kitty.id);
    const amountCents = validateTopupAmount(input.amount, availableCents);

    let row = await repo.addLeashAllocation(tx, leashId, amountCents);

    if (locked.status === "exhausted") {
      row = await repo.updateLeashStatus(tx, leashId, "active", null);
    }

    await postLedgerTxn(
      tx,
      allocateLeash({ txnId: newTxnId(), kittyId: kitty.id, leashId, amountCents }),
      kitty.id,
      { kind: "topup", ref: leashId },
    );

    await auditRepo.insertAuditEvent(tx, {
      kittyId: kitty.id,
      actor: `user:${actorUserId}`,
      type: "leash.topped_up",
      data: { leashId, amount: centsToWire(amountCents) },
    });

    return row;
  });

  const balance = await repo.leashBalance(db, kitty.id, leashId);

  return toLeashListItem(updated, balance);
}

async function transitionLeash(
  db: Db,
  leashId: string,
  transition: "pause" | "resume",
  reason: string | undefined,
  actorUserId: string,
): Promise<LeashDetail> {
  const leash = await requireLeash(db, leashId);
  const kitty = requireOwnedKitty(await kittiesRepo.findKittyById(db, leash.kittyId), actorUserId);

  await db.transaction(async (tx) => {
    const locked = await repo.findLeashByIdForUpdate(tx, leashId);

    if (locked === undefined) {
      throw new AppError(errorCodes.leashNotFound, 404, { leashId });
    }

    assertLeashTransition(locked.status, transition);

    await repo.updateLeashStatus(
      tx,
      leashId,
      transition === "pause" ? "paused" : "active",
      reason ?? null,
    );

    await auditRepo.insertAuditEvent(tx, {
      kittyId: kitty.id,
      actor: `user:${actorUserId}`,
      type: `leash.${transition === "pause" ? "paused" : "resumed"}`,
      data: { leashId, reason: reason ?? null },
    });
  });

  return getLeashDetail(db, leashId, actorUserId);
}

export async function pauseLeash(
  db: Db,
  leashId: string,
  reason: string | undefined,
  actorUserId: string,
): Promise<LeashDetail> {
  return transitionLeash(db, leashId, "pause", reason, actorUserId);
}

export async function resumeLeash(
  db: Db,
  leashId: string,
  reason: string | undefined,
  actorUserId: string,
): Promise<LeashDetail> {
  return transitionLeash(db, leashId, "resume", reason, actorUserId);
}

export async function revokeLeash(
  db: Db,
  leashId: string,
  reason: string | undefined,
  actorUserId: string,
): Promise<LeashDetail> {
  const leash = await requireLeash(db, leashId);
  const kitty = requireOwnedKitty(await kittiesRepo.findKittyById(db, leash.kittyId), actorUserId);

  await db.transaction(async (tx) => {
    const locked = await repo.findLeashByIdForUpdate(tx, leashId);

    if (locked === undefined) {
      throw new AppError(errorCodes.leashNotFound, 404, { leashId });
    }

    assertLeashTransition(locked.status, "revoke");

    // Cascade: a revoked parent first pulls its children's available money back
    // into itself, then returns everything it holds to its own source
    // (docs/05 §9).
    const children = await repo.listChildLeashes(tx, leashId);

    for (const child of children) {
      if (child.status === "revoked" || child.status === "expired") {
        continue;
      }

      const childLocked = await repo.findLeashByIdForUpdate(tx, child.id);

      if (childLocked === undefined) {
        continue;
      }

      const childAvailableCents = await repo.leashAvailableCents(tx, child.id);

      if (childAvailableCents > 0n) {
        await postLedgerTxn(
          tx,
          revokeLeashTxn({
            txnId: newTxnId(),
            leashId: child.id,
            returnTo: leashAvailable(leashId),
            amountCents: childAvailableCents,
          }),
          kitty.id,
          { ref: child.id },
        );
      }

      await repo.updateLeashStatus(tx, child.id, "revoked", reason ?? "parent revoked");
      await auditRepo.insertAuditEvent(tx, {
        kittyId: kitty.id,
        actor: `user:${actorUserId}`,
        type: "leash.revoked",
        data: { leashId: child.id, cascadeFrom: leashId },
      });
    }

    const availableCents = await repo.leashAvailableCents(tx, leashId);

    if (availableCents > 0n) {
      const returnTo =
        locked.parentId === null ? kittyAvailable(kitty.id) : leashAvailable(locked.parentId);

      await postLedgerTxn(
        tx,
        revokeLeashTxn({ txnId: newTxnId(), leashId, returnTo, amountCents: availableCents }),
        kitty.id,
        { ref: leashId },
      );
    }

    await repo.updateLeashStatus(tx, leashId, "revoked", reason ?? null);
    await auditRepo.insertAuditEvent(tx, {
      kittyId: kitty.id,
      actor: `user:${actorUserId}`,
      type: "leash.revoked",
      data: { leashId, reason: reason ?? null },
    });
  });

  return getLeashDetail(db, leashId, actorUserId);
}

export async function getLeashDetail(
  db: Db,
  leashId: string,
  actorUserId: string,
): Promise<LeashDetail> {
  const leash = await requireLeash(db, leashId);
  requireOwnedKitty(await kittiesRepo.findKittyById(db, leash.kittyId), actorUserId);

  const balance = await repo.leashBalance(db, leash.kittyId, leashId);
  const spent24hCents = await repo.spent24hCents(db, leashId);
  const children = await repo.listChildLeashes(db, leashId);

  return toLeashDetail(leash, balance, spent24hCents, children);
}

export async function listKittyLeashes(
  db: Db,
  kittyId: string,
  actorUserId: string,
): Promise<LeashList> {
  requireOwnedKitty(await kittiesRepo.findKittyById(db, kittyId), actorUserId);

  const rows = await repo.listLeashesByKitty(db, kittyId);
  const balances = await repo.leashBalancesByKitty(db, kittyId);
  const empty: LeashBalanceCents = { availableCents: 0n, heldCents: 0n };

  return {
    items: rows.map((row) => toLeashListItem(row, balances.get(row.id) ?? empty)),
  };
}

export async function listKittyIntents(
  db: Db,
  kittyId: string,
  actorUserId: string,
  query: ListIntentsQuery,
): Promise<IntentList> {
  requireOwnedKitty(await kittiesRepo.findKittyById(db, kittyId), actorUserId);

  const rows = await repo.listIntents(db, {
    kittyId,
    status: query.status,
    leashId: query.leashId,
    limit: DEFAULT_INTENTS_LIMIT,
  });

  return { items: rows.map(toSpendIntent) };
}
