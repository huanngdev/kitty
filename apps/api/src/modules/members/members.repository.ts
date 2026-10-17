import { type DbLike, type MemberRow, type NewMember, members } from "@kitty/db";
import { asc, eq, and } from "drizzle-orm";

/** Drizzle queries for members (CODE_RULES.md §D): no business rules. */

export interface MembersRepository {
  insert(row: NewMember): Promise<MemberRow>;
  listByEvent(eventId: string): Promise<MemberRow[]>;
  findById(id: string): Promise<MemberRow | undefined>;
  /** Case-normalized email lookup backing `UNIQUE (event_id, email)`. */
  findByEventAndEmail(eventId: string, email: string): Promise<MemberRow | undefined>;
  /** Scoped delete; returns the number of rows removed (0 when absent). */
  deleteByIdForEvent(eventId: string, memberId: string): Promise<number>;
}

export function createMembersRepository(db: DbLike): MembersRepository {
  return {
    async insert(row) {
      const [inserted] = await db.insert(members).values(row).returning();

      if (inserted === undefined) {
        throw new Error("member insert returned no row");
      }

      return inserted;
    },

    async listByEvent(eventId) {
      return db
        .select()
        .from(members)
        .where(eq(members.eventId, eventId))
        .orderBy(asc(members.name), asc(members.id));
    },

    async findById(id) {
      const [row] = await db.select().from(members).where(eq(members.id, id)).limit(1);

      return row;
    },

    async findByEventAndEmail(eventId, email) {
      const [row] = await db
        .select()
        .from(members)
        .where(and(eq(members.eventId, eventId), eq(members.email, email)))
        .limit(1);

      return row;
    },

    async deleteByIdForEvent(eventId, memberId) {
      const removed = await db
        .delete(members)
        .where(and(eq(members.id, memberId), eq(members.eventId, eventId)))
        .returning({ id: members.id });

      return removed.length;
    },
  };
}
