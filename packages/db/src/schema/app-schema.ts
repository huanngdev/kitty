import { pgSchema } from "drizzle-orm/pg-core";

/**
 * The Postgres `app` schema — product data owned by the web app and `apps/api`.
 *
 * It lives in its own module so `app.ts` (product tables, whose
 * `events.organizer_id` references `app.user`) and `auth.ts` (the Better Auth
 * tables) can both import it without a circular import. `app.ts` re-exports it,
 * so `import { appSchema } from "@kitty/db/schema"` still works.
 */
export const appSchema = pgSchema("app");
