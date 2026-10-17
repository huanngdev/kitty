import type { BudgetLineRow } from "@kitty/db";
import { formatMoney, parseMoney } from "@kitty/ledger";
import { idPrefixes, newId } from "@kitty/shared";
import { type BudgetLine, type PutBudgetLinesInput, categorySchema } from "@kitty/shared/events";
import { getDb } from "../../lib/db";
import { narrowEnum } from "../../lib/narrow";
import { requireOwnedEvent } from "../events/events.ownership";
import { type EventsRepository, createEventsRepository } from "../events/events.repository";
import { type BudgetLinesRepository, createBudgetLinesRepository } from "./budget-lines.repository";

/**
 * Budget-line service (docs/10-api-spec.md §4). The organizer replaces the whole
 * planned-spend set for an event; per-category duplicates are rejected by the
 * request schema and by `UNIQUE (event_id, category)`.
 */

/** Maps a DB row to the wire contract (money: bigint cents → `"12.34"`). */
export function toBudgetLine(row: BudgetLineRow): BudgetLine {
  return {
    id: row.id,
    eventId: row.eventId,
    category: narrowEnum(row.category, categorySchema.options, "budget_line.category"),
    planned: formatMoney(row.plannedCents),
  };
}

export interface BudgetLinesService {
  list(eventId: string, actorUserId: string): Promise<BudgetLine[]>;
  replace(eventId: string, input: PutBudgetLinesInput, actorUserId: string): Promise<BudgetLine[]>;
}

export interface BudgetLinesServiceDeps {
  readonly events: EventsRepository;
  readonly budgetLines: BudgetLinesRepository;
}

export function createBudgetLinesService(deps: BudgetLinesServiceDeps): BudgetLinesService {
  return {
    async list(eventId, actorUserId) {
      await requireOwnedEvent(deps.events, eventId, actorUserId);

      const rows = await deps.budgetLines.listByEvent(eventId);

      return rows.map(toBudgetLine);
    },

    async replace(eventId, input, actorUserId) {
      await requireOwnedEvent(deps.events, eventId, actorUserId);

      const rows = await deps.budgetLines.replaceForEvent(
        eventId,
        input.lines.map((line) => ({
          id: newId(idPrefixes.budgetLine),
          eventId,
          category: line.category,
          plannedCents: parseMoney(line.planned),
        })),
      );

      return rows.map(toBudgetLine);
    },
  };
}

let defaultService: BudgetLinesService | undefined;

/** The singleton service wired to the pooled DB. */
export function getBudgetLinesService(): BudgetLinesService {
  defaultService ??= createBudgetLinesService({
    events: createEventsRepository(getDb()),
    budgetLines: createBudgetLinesRepository(getDb()),
  });

  return defaultService;
}
