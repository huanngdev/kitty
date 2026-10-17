import type { Db } from "@kitty/db";

/**
 * A Drizzle transaction handle, derived from `Db` so the gateway never
 * re-declares Drizzle's types (CODE_RULES.md §B, §D).
 */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Anything the repositories can run queries against: the pooled client or a
 * transaction opened by a service. Services take this as their first argument
 * so they stay testable and every money movement can run in one transaction.
 */
export type DbLike = Db | DbTx;
