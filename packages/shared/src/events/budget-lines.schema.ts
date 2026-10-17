import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { moneyWireSchema } from "../leash-admin/money.schema";
import { categorySchema } from "./events.schema";

/**
 * Budget-line contracts for the Web App API (docs/09-data-model.md §2).
 *
 * `app.budget_lines` is a set keyed by `(event_id, category)`; the organizer
 * replaces the whole set with `PUT /api/events/:id/budget-lines`, so the wire
 * shape is one array rather than per-line create/delete (docs/10-api-spec.md §4).
 */

export const budgetLineSchema = z.object({
  id: idSchema(idPrefixes.budgetLine),
  eventId: idSchema(idPrefixes.event),
  category: categorySchema,
  /** Planned spend for the category, a decimal money string. */
  planned: moneyWireSchema,
});

export type BudgetLine = z.infer<typeof budgetLineSchema>;

/** A single line in the replacement body (no id — the server assigns it). */
export const budgetLineInputSchema = z.object({
  category: categorySchema,
  planned: moneyWireSchema,
});

export type BudgetLineInput = z.infer<typeof budgetLineInputSchema>;

/**
 * `PUT /api/events/:id/budget-lines` body: the full replacement set. Categories
 * must be unique because `app.budget_lines` is keyed by `(event_id, category)`.
 */
export const putBudgetLinesSchema = z
  .object({
    lines: z.array(budgetLineInputSchema).max(20),
  })
  .refine(
    (input) => new Set(input.lines.map((line) => line.category)).size === input.lines.length,
    { error: "budget line categories must be unique" },
  );

export type PutBudgetLinesInput = z.infer<typeof putBudgetLinesSchema>;

/** `GET` / `PUT /api/events/:id/budget-lines` response. */
export const budgetLineListResponseSchema = z.object({ items: z.array(budgetLineSchema) });

export type BudgetLineListResponse = z.infer<typeof budgetLineListResponseSchema>;
