import { type BudgetLineRow, type Db, type NewBudgetLine, budgetLines } from "@kitty/db";
import { asc, eq } from "drizzle-orm";

/** Drizzle queries for budget lines (CODE_RULES.md §D): no business rules. */

export interface BudgetLinesRepository {
  listByEvent(eventId: string): Promise<BudgetLineRow[]>;
  /** Replaces the whole `(event_id, category)` set in one transaction. */
  replaceForEvent(eventId: string, rows: NewBudgetLine[]): Promise<BudgetLineRow[]>;
}

/**
 * Takes the full `Db` (not `DbLike`) because a replace needs `db.transaction`
 * to be atomic: clear the set, then insert the new one.
 */
export function createBudgetLinesRepository(db: Db): BudgetLinesRepository {
  return {
    async listByEvent(eventId) {
      return db
        .select()
        .from(budgetLines)
        .where(eq(budgetLines.eventId, eventId))
        .orderBy(asc(budgetLines.category));
    },

    async replaceForEvent(eventId, rows) {
      return db.transaction(async (tx) => {
        await tx.delete(budgetLines).where(eq(budgetLines.eventId, eventId));

        if (rows.length === 0) {
          return [];
        }

        return tx.insert(budgetLines).values(rows).returning();
      });
    },
  };
}
