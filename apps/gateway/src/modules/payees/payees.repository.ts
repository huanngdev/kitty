import { type NewVerifiedPayee, type VerifiedPayeeRow, verifiedPayees } from "@kitty/db";
import { and, asc, eq } from "drizzle-orm";
import type { DbLike } from "../../lib/db-types";

/** Drizzle queries for organizer-verified payees (AGENTS.md invariant #12). */

/** Idempotent verify: a repeated `POST` for the same email is a no-op. */
export async function upsertVerifiedPayee(db: DbLike, row: NewVerifiedPayee): Promise<void> {
  await db
    .insert(verifiedPayees)
    .values(row)
    .onConflictDoNothing({ target: [verifiedPayees.kittyId, verifiedPayees.email] });
}

export async function listVerifiedPayees(db: DbLike, kittyId: string): Promise<VerifiedPayeeRow[]> {
  return db
    .select()
    .from(verifiedPayees)
    .where(eq(verifiedPayees.kittyId, kittyId))
    .orderBy(asc(verifiedPayees.email));
}

/** Lowercase emails verified for the kitty, for leash-create validation. */
export async function verifiedPayeeEmails(db: DbLike, kittyId: string): Promise<string[]> {
  const rows = await db
    .select({ email: verifiedPayees.email })
    .from(verifiedPayees)
    .where(eq(verifiedPayees.kittyId, kittyId));

  return rows.map((row) => row.email);
}

/** Returns the number of rows removed (0 when the email was not verified). */
export async function deleteVerifiedPayee(
  db: DbLike,
  kittyId: string,
  email: string,
): Promise<number> {
  const removed = await db
    .delete(verifiedPayees)
    .where(and(eq(verifiedPayees.kittyId, kittyId), eq(verifiedPayees.email, email)))
    .returning({ email: verifiedPayees.email });

  return removed.length;
}
