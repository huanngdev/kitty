import type { Db, VerifiedPayeeRow } from "@kitty/db";
import { errorCodes } from "@kitty/shared";
import { type VerifiedPayee } from "@kitty/shared/leash-admin";
import { AppError } from "../../lib/errors";
import { requireOwnedKitty } from "../../lib/ownership";
import * as auditRepo from "../audit/audit.repository";
import * as kittiesRepo from "../kitties/kitties.repository";
import * as repo from "./payees.repository";

/**
 * Verified-payee service (AGENTS.md invariant #12, docs/10-api-spec.md §1).
 *
 * Only the kitty organizer can verify or remove a vendor email; a leash may
 * then name it in `allowedPayees` (KIT-21 calls these from the web app).
 */

export interface PayeeList {
  readonly items: VerifiedPayee[];
}

function toVerifiedPayee(row: VerifiedPayeeRow): VerifiedPayee {
  return {
    kittyId: row.kittyId,
    email: row.email,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt.toISOString(),
  };
}

export async function verifyPayee(
  db: Db,
  kittyId: string,
  email: string,
  actorUserId: string,
): Promise<VerifiedPayee> {
  const kitty = requireOwnedKitty(await kittiesRepo.findKittyById(db, kittyId), actorUserId);
  const normalizedEmail = email.trim().toLowerCase();

  const row = await db.transaction(async (tx) => {
    await repo.upsertVerifiedPayee(tx, {
      kittyId: kitty.id,
      email: normalizedEmail,
      verifiedBy: actorUserId,
    });

    await auditRepo.insertAuditEvent(tx, {
      kittyId: kitty.id,
      actor: `user:${actorUserId}`,
      type: "payee.verified",
      data: { email: normalizedEmail },
    });

    const payees = await repo.listVerifiedPayees(tx, kitty.id);
    return payees.find((payee) => payee.email === normalizedEmail);
  });

  if (row === undefined) {
    throw new AppError(errorCodes.internal, 500, { context: "payee verify read-back" });
  }

  return toVerifiedPayee(row);
}

export async function listPayees(db: Db, kittyId: string, actorUserId: string): Promise<PayeeList> {
  requireOwnedKitty(await kittiesRepo.findKittyById(db, kittyId), actorUserId);

  const rows = await repo.listVerifiedPayees(db, kittyId);

  return { items: rows.map(toVerifiedPayee) };
}

export async function removePayee(
  db: Db,
  kittyId: string,
  email: string,
  actorUserId: string,
): Promise<{ email: string }> {
  const kitty = requireOwnedKitty(await kittiesRepo.findKittyById(db, kittyId), actorUserId);
  const normalizedEmail = email.trim().toLowerCase();

  await db.transaction(async (tx) => {
    const removed = await repo.deleteVerifiedPayee(tx, kitty.id, normalizedEmail);

    if (removed === 0) {
      throw new AppError(errorCodes.payeeNotFound, 404, { email: normalizedEmail });
    }

    await auditRepo.insertAuditEvent(tx, {
      kittyId: kitty.id,
      actor: `user:${actorUserId}`,
      type: "payee.removed",
      data: { email: normalizedEmail },
    });
  });

  return { email: normalizedEmail };
}
