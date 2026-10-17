import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Sql } from "postgres";
import * as schema from "./schema/index";

/**
 * The Kitty database handle: a Drizzle client bound to the full schema, plus the
 * underlying postgres.js client for lifecycle operations (for example
 * `$client.end()`).
 */
export type Db = PostgresJsDatabase<typeof schema> & { $client: Sql };

/**
 * Creates the Postgres client used by `apps/api` and `apps/gateway`.
 *
 * Always pass the **pooled** Neon connection string (`DATABASE_URL`). PgBouncer
 * runs in transaction mode, so prepared statements must be disabled
 * (`prepare: false`) — see docs/08-infrastructure.md §2.1. Migrations use the
 * direct connection via drizzle-kit (`packages/db/drizzle.config.ts`).
 */
export function createDb(databaseUrl: string): Db {
  const client = postgres(databaseUrl, { prepare: false, max: 10 });
  return drizzle(client, { schema });
}
