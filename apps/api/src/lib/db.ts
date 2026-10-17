import { createDb, type Db } from "@kitty/db";
import { env } from "../env";
import { AppError } from "./errors";

let db: Db | undefined;

/**
 * Lazily creates the database client from the pooled `DATABASE_URL`.
 *
 * The API starts without a database; only the first call that needs
 * persistence fails, and it fails with a clear error.
 */
export function getDb(): Db {
  if (env.DATABASE_URL === undefined) {
    throw new AppError("DATABASE_URL_MISSING", 503, {
      hint: "Set DATABASE_URL in apps/api/.env (see apps/api/.env.example).",
    });
  }

  db ??= createDb(env.DATABASE_URL);

  return db;
}
