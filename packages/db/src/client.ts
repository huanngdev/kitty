import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

/**
 * Creates the Postgres client used by `apps/api` and `apps/gateway`.
 *
 * Always pass the **pooled** Neon connection string (`DATABASE_URL`). PgBouncer
 * runs in transaction mode, so prepared statements must be disabled
 * (`prepare: false`) — see docs/08-infrastructure.md §2.1. Migrations use the
 * direct connection via drizzle-kit (`packages/db/drizzle.config.ts`).
 */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { prepare: false, max: 10 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
