import type { AuditEventRow, Db } from "@kitty/db";
import { type AuditEvent, type AuditQuery } from "@kitty/shared/leash-admin";
import { requireOwnedKitty } from "../../lib/ownership";
import { parseCursor } from "../../lib/pagination";
import * as kittiesRepo from "../kitties/kitties.repository";
import * as repo from "./audit.repository";

/**
 * Audit service (docs/10-api-spec.md §1). The log is append-only; other services
 * write to it through {@link repo.insertAuditEvent} inside their transactions,
 * while this module serves the read feed.
 */

export function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    kittyId: row.kittyId,
    actor: row.actor,
    type: row.type,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface AuditFeed {
  readonly items: AuditEvent[];
  readonly nextCursor: string | null;
}

export async function listKittyAudit(
  db: Db,
  kittyId: string,
  actorUserId: string,
  query: AuditQuery,
): Promise<AuditFeed> {
  requireOwnedKitty(await kittiesRepo.findKittyById(db, kittyId), actorUserId);

  const page = await repo.listAuditEvents(db, {
    kittyId,
    cursorId: parseCursor(query.cursor),
    limit: query.limit,
  });

  return { items: page.items.map(toAuditEvent), nextCursor: page.nextCursor };
}
