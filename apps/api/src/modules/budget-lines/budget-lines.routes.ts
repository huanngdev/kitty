import { zValidator } from "@hono/zod-validator";
import { budgetLineListResponseSchema, putBudgetLinesSchema } from "@kitty/shared/events";
import { Hono } from "hono";
import { eventIdParamSchema } from "../../lib/params";
import { validationHook } from "../../lib/validate";
import { type AppEnv, requireUser } from "../../middleware/session";
import { type BudgetLinesService, getBudgetLinesService } from "./budget-lines.service";

/**
 * Budget-line routes (docs/10-api-spec.md §4), mounted under `/api/events`:
 * `GET /api/events/:id/budget-lines` and `PUT /api/events/:id/budget-lines`
 * (the `PUT` replaces the whole set).
 *
 * `getService` is injected for route tests; the app uses {@link getBudgetLinesService}.
 */
export function createBudgetLinesRoutes(getService: () => BudgetLinesService): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .get(
      "/:id/budget-lines",
      zValidator("param", eventIdParamSchema, validationHook),
      async (c) => {
        const user = requireUser(c);
        const items = await getService().list(c.req.valid("param").id, user.id);

        return c.json(budgetLineListResponseSchema.parse({ items }));
      },
    )
    .put(
      "/:id/budget-lines",
      zValidator("param", eventIdParamSchema, validationHook),
      zValidator("json", putBudgetLinesSchema, validationHook),
      async (c) => {
        const user = requireUser(c);
        const items = await getService().replace(
          c.req.valid("param").id,
          c.req.valid("json"),
          user.id,
        );

        return c.json(budgetLineListResponseSchema.parse({ items }));
      },
    );
}

/** The app-mounted router, wired to the singleton service. */
export const budgetLinesRoutes = createBudgetLinesRoutes(getBudgetLinesService);
