import { zValidator } from "@hono/zod-validator";
import {
  createEventSchema,
  eventDetailResponseSchema,
  eventListResponseSchema,
  updateEventSchema,
} from "@kitty/shared/events";
import { Hono } from "hono";
import { eventIdParamSchema } from "../../lib/params";
import { validationHook } from "../../lib/validate";
import { type AppEnv, requireUser } from "../../middleware/session";
import { type EventsService, getEventsService } from "./events.service";

/**
 * Event routes (docs/10-api-spec.md §4), mounted under `/api/events`:
 *
 * - `POST   /api/events`        create (also creates the gateway kitty)
 * - `GET    /api/events`        the session user's events
 * - `GET    /api/events/:id`    detail
 * - `PATCH  /api/events/:id`    update
 *
 * `getService` is injected so route tests can mount these routes with a fake
 * service and a fake session; the app uses {@link getEventsService}.
 */
export function createEventsRoutes(getService: () => EventsService): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .post("/", zValidator("json", createEventSchema, validationHook), async (c) => {
      const user = requireUser(c);
      const event = await getService().create(c.req.valid("json"), user.id);

      return c.json(eventDetailResponseSchema.parse(event), 201);
    })
    .get("/", async (c) => {
      const user = requireUser(c);
      const items = await getService().list(user.id);

      return c.json(eventListResponseSchema.parse({ items }));
    })
    .get("/:id", zValidator("param", eventIdParamSchema, validationHook), async (c) => {
      const user = requireUser(c);
      const event = await getService().get(c.req.valid("param").id, user.id);

      return c.json(eventDetailResponseSchema.parse(event));
    })
    .patch(
      "/:id",
      zValidator("param", eventIdParamSchema, validationHook),
      zValidator("json", updateEventSchema, validationHook),
      async (c) => {
        const user = requireUser(c);
        const event = await getService().update(
          c.req.valid("param").id,
          c.req.valid("json"),
          user.id,
        );

        return c.json(eventDetailResponseSchema.parse(event));
      },
    );
}

/** The app-mounted router, wired to the singleton service. */
export const eventsRoutes = createEventsRoutes(getEventsService);
