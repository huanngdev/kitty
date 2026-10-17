import { pgSchema } from "drizzle-orm/pg-core";

/**
 * `app` schema — product data owned by the web BFF and `apps/api`.
 *
 * Tables (users, events, members, …) are added in Task C; see
 * `docs/09-data-model.md` §2.
 */
export const appSchema = pgSchema("app");
