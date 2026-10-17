import { type AuditEventRow, type NewAuditEvent, auditEvents } from "@kitty/db";
import { and, desc, eq, lt } from "drizzle-orm";
import type { DbLike } from "../../lib/db-types";

/** Drizzle queries for the append-only audit log (CODE_RULES.md §D). */

export async function insertAuditEvent(db: DbLike, row: NewAuditEvent): Promise<void> {
  await db.insert(auditEvents).values(row);
}

export interface ListAuditInput {
  readonly kittyId: string;
  readonly cursorId: number | undefined;
  readonly limit: number;
}

export interface AuditPage {
  readonly items: AuditEventRow[];
  readonly nextCursor: string | null;
}

export async function listAuditEvents(db: DbLike, input: ListAuditInput): Promise<AuditPage> {
  const where =
    input.cursorId === undefined
      ? eq(auditEvents.kittyId, input.kittyId)
      : and(eq(auditEvents.kittyId, input.kittyId), lt(auditEvents.id, input.cursorId));

  const items = await db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.id))
    .limit(input.limit);

  const last = items.at(-1);
  const nextCursor = items.length === input.limit && last !== undefined ? String(last.id) : null;

  return { items, nextCursor };
}
