import { type DbLike, type NewVendor, type VendorRow, vendors } from "@kitty/db";
import { and, asc, eq } from "drizzle-orm";

/** Drizzle queries for vendors (CODE_RULES.md §D): no business rules. */

export interface VendorsRepository {
  insert(row: NewVendor): Promise<VendorRow>;
  listByEvent(eventId: string): Promise<VendorRow[]>;
  findByIdForEvent(eventId: string, vendorId: string): Promise<VendorRow | undefined>;
  update(
    eventId: string,
    vendorId: string,
    patch: Partial<NewVendor>,
  ): Promise<VendorRow | undefined>;
  /** The organizer confirmation gate (AGENTS.md invariant #12). */
  setVerified(eventId: string, vendorId: string, verified: boolean): Promise<VendorRow | undefined>;
}

export function createVendorsRepository(db: DbLike): VendorsRepository {
  return {
    async insert(row) {
      const [inserted] = await db.insert(vendors).values(row).returning();

      if (inserted === undefined) {
        throw new Error("vendor insert returned no row");
      }

      return inserted;
    },

    async listByEvent(eventId) {
      return db
        .select()
        .from(vendors)
        .where(eq(vendors.eventId, eventId))
        .orderBy(asc(vendors.name), asc(vendors.id));
    },

    async findByIdForEvent(eventId, vendorId) {
      const [row] = await db
        .select()
        .from(vendors)
        .where(and(eq(vendors.id, vendorId), eq(vendors.eventId, eventId)))
        .limit(1);

      return row;
    },

    async update(eventId, vendorId, patch) {
      const [row] = await db
        .update(vendors)
        .set(patch)
        .where(and(eq(vendors.id, vendorId), eq(vendors.eventId, eventId)))
        .returning();

      return row;
    },

    async setVerified(eventId, vendorId, verified) {
      const [row] = await db
        .update(vendors)
        .set({ verified })
        .where(and(eq(vendors.id, vendorId), eq(vendors.eventId, eventId)))
        .returning();

      return row;
    },
  };
}
