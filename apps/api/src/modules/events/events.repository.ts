import { type DbLike, type EventRow, type NewEvent, events } from "@kitty/db";
import { asc, desc, eq } from "drizzle-orm";

/**
 * Drizzle queries for events (CODE_RULES.md §D): no business rules, only SQL.
 *
 * Built around a `DbLike` so a service can hand it either the pooled client or
 * an open transaction, and so unit tests can substitute a fake.
 */

export interface EventsRepository {
  insert(row: NewEvent): Promise<EventRow>;
  findById(id: string): Promise<EventRow | undefined>;
  /** The organizer's events, newest first (the `GET /api/events` "mine" list). */
  listByOrganizer(organizerId: string): Promise<EventRow[]>;
  update(id: string, patch: Partial<NewEvent>): Promise<EventRow | undefined>;
  /** Stores the gateway kitty id after the kitty is created. */
  setKittyId(id: string, kittyId: string): Promise<EventRow | undefined>;
  /** Removes an event (the compensating delete of a failed create). */
  deleteById(id: string): Promise<void>;
}

export function createEventsRepository(db: DbLike): EventsRepository {
  return {
    async insert(row) {
      const [inserted] = await db.insert(events).values(row).returning();

      if (inserted === undefined) {
        throw new Error("event insert returned no row");
      }

      return inserted;
    },

    async findById(id) {
      const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);

      return row;
    },

    async listByOrganizer(organizerId) {
      return db
        .select()
        .from(events)
        .where(eq(events.organizerId, organizerId))
        .orderBy(desc(events.createdAt), asc(events.id));
    },

    async update(id, patch) {
      const [row] = await db.update(events).set(patch).where(eq(events.id, id)).returning();

      return row;
    },

    async setKittyId(id, kittyId) {
      const [row] = await db.update(events).set({ kittyId }).where(eq(events.id, id)).returning();

      return row;
    },

    async deleteById(id) {
      await db.delete(events).where(eq(events.id, id));
    },
  };
}
