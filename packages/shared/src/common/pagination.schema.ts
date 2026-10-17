import { z } from "zod";

/** Cursor pagination query: `?cursor=<opaque>&limit=<1-100>`. */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** A page of items plus the cursor for the next page (`null` on the last page). */
export interface CursorPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

/** Builds the response schema for a cursor-paginated list of `item`. */
export function cursorPageSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
