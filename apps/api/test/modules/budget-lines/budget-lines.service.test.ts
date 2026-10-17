import { describe, expect, test } from "bun:test";
import { putBudgetLinesSchema } from "@kitty/shared/events";
import { AppError } from "../../../src/lib/errors";
import {
  EVENT_ID,
  ORG_USER_ID,
  createFakeBudgetLinesRepository,
  createFakeEventsRepository,
  makeBudgetLineRow,
  makeEventRow,
} from "../../support/fakes";
import { createBudgetLinesService } from "../../../src/modules/budget-lines/budget-lines.service";

function deps(seed: Parameters<typeof makeEventRow>[0] = {}) {
  const events = createFakeEventsRepository([makeEventRow(seed)]);
  const budgetLines = createFakeBudgetLinesRepository();

  return {
    events,
    budgetLines,
    service: createBudgetLinesService({ events: events.repo, budgetLines: budgetLines.repo }),
  };
}

async function captureError(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }

    throw error;
  }

  throw new Error("expected an AppError");
}

describe("budgetLinesService.replace", () => {
  test("replaces the whole set and maps money to the wire format", async () => {
    const { service, budgetLines } = deps();
    budgetLines.rows.push(makeBudgetLineRow({ category: "food", plannedCents: 100n }));

    const lines = await service.replace(
      EVENT_ID,
      putBudgetLinesSchema.parse({
        lines: [
          { category: "lodging", planned: "500.00" },
          { category: "transport", planned: "120.50" },
        ],
      }),
      ORG_USER_ID,
    );

    expect(lines.map((line) => [line.category, line.planned])).toEqual([
      ["lodging", "500.00"],
      ["transport", "120.50"],
    ]);
    expect(budgetLines.rows).toHaveLength(2);
  });

  test("requires the organizer (403) and a known event (404)", async () => {
    const { service } = deps();
    const input = putBudgetLinesSchema.parse({ lines: [] });

    const forbidden = await captureError(() => service.replace(EVENT_ID, input, "user_other"));
    const missing = await captureError(() =>
      service.replace("evt_01JZ0000000000000000000099", input, ORG_USER_ID),
    );

    expect(forbidden.code).toBe("EVENT_NOT_FOUND");
    expect(missing.code).toBe("EVENT_NOT_FOUND");
  });
});

describe("putBudgetLinesSchema", () => {
  test("rejects duplicate categories", () => {
    const result = putBudgetLinesSchema.safeParse({
      lines: [
        { category: "food", planned: "1.00" },
        { category: "food", planned: "2.00" },
      ],
    });

    expect(result.success).toBe(false);
  });
});
