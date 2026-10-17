import type { LeashRow } from "@kitty/db/schema";
import {
  ACTIONS,
  CATEGORY_WILDCARD,
  LEASH_STATUSES,
  REASON_MESSAGES,
  type Action,
  type AllowedCategories,
  type Category,
  type DecisionReason,
  type Leash,
} from "@kitty/leash";
import { z } from "zod";
import { AppError } from "../../lib/errors";

/** Runtime validators that narrow a DB row back into a domain object. */
const actionSchema = z.enum(ACTIONS);
const categorySchema = z.enum([
  "lodging",
  "food",
  "transport",
  "gear",
  "merch",
  "activities",
  "other",
]);
const leashStatusSchema = z.enum(LEASH_STATUSES);

function parseAllowedActions(values: readonly string[]): Action[] {
  const parsed = z.array(actionSchema).safeParse(values);

  if (!parsed.success) {
    throw new AppError("LEASH_ROW_INVALID", 500, { field: "allowedActions" });
  }

  return parsed.data;
}

function parseAllowedCategories(values: readonly string[]): AllowedCategories {
  if (values.length === 1 && values[0] === CATEGORY_WILDCARD) {
    return [CATEGORY_WILDCARD];
  }

  const parsed = z.array(categorySchema).safeParse(values);

  if (!parsed.success) {
    throw new AppError("LEASH_ROW_INVALID", 500, { field: "allowedCategories" });
  }

  return parsed.data satisfies Category[];
}

/**
 * Maps a `leash.leashes` row onto the pure `@kitty/leash` `Leash` type
 * (docs/05 §2). Money stays `bigint` cents; timestamps become ISO-8601 strings
 * so the policy engine never touches a `Date`.
 */
export function toDomainLeash(row: LeashRow): Leash {
  return {
    id: row.id,
    kittyId: row.kittyId,
    parentId: row.parentId,
    agentId: row.agentId,
    agentPublicKey: "",
    currency: row.currency,
    allocationCents: row.allocationCents,
    limits: {
      perTxMaxCents: row.perTxMaxCents,
      dailyMaxCents: row.dailyMaxCents,
      maxTxPerHour: row.maxTxPerHour,
    },
    allowedActions: parseAllowedActions(row.allowedActions),
    allowedPayees: [...row.allowedPayees],
    allowedCategories: parseAllowedCategories(row.allowedCategories),
    stepUpAboveCents: row.stepUpAboveCents,
    notBefore: row.notBefore.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: leashStatusSchema.parse(row.status),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The decision reasons stored on an intent, safely narrowed to the known codes. */
export function parseReasons(value: unknown): DecisionReason[] {
  const parsed = z
    .array(z.object({ code: z.string(), details: z.string() }))
    .safeParse(value ?? []);

  if (!parsed.success) {
    return [];
  }

  const knownCodes = new Set<string>(Object.keys(REASON_MESSAGES));

  return parsed.data.filter((reason): reason is DecisionReason => knownCodes.has(reason.code));
}

/** Type guard for the three stored decisions. */
export function isDecisionOutcome(value: string): value is "ALLOW" | "DENY" | "STEP_UP" {
  return value === "ALLOW" || value === "DENY" || value === "STEP_UP";
}
