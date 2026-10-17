import { zValidator } from "@hono/zod-validator";
import {
  createMemberSchema,
  deleteMemberResponseSchema,
  memberDetailResponseSchema,
  memberListResponseSchema,
} from "@kitty/shared/members";
import { Hono } from "hono";
import { memberIdParamSchema, eventIdParamSchema } from "../../lib/params";
import { validationHook } from "../../lib/validate";
import { type AppEnv, requireUser } from "../../middleware/session";
import { type MembersService, getMembersService } from "./members.service";

/**
 * Member routes (docs/10-api-spec.md §4), mounted under `/api/events`:
 * `POST/GET /api/events/:id/members` and `DELETE /api/events/:id/members/:memberId`.
 *
 * `getService` is injected for route tests; the app uses {@link getMembersService}.
 */
export function createMembersRoutes(getService: () => MembersService): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .post(
      "/:id/members",
      zValidator("param", eventIdParamSchema, validationHook),
      zValidator("json", createMemberSchema, validationHook),
      async (c) => {
        const user = requireUser(c);
        const member = await getService().create(
          c.req.valid("param").id,
          c.req.valid("json"),
          user.id,
        );

        return c.json(memberDetailResponseSchema.parse(member), 201);
      },
    )
    .get("/:id/members", zValidator("param", eventIdParamSchema, validationHook), async (c) => {
      const user = requireUser(c);
      const items = await getService().list(c.req.valid("param").id, user.id);

      return c.json(memberListResponseSchema.parse({ items }));
    })
    .delete(
      "/:id/members/:memberId",
      zValidator("param", memberIdParamSchema, validationHook),
      async (c) => {
        const user = requireUser(c);
        const result = await getService().remove(
          c.req.valid("param").id,
          c.req.valid("param").memberId,
          user.id,
        );

        return c.json(deleteMemberResponseSchema.parse(result));
      },
    );
}

/** The app-mounted router, wired to the singleton service. */
export const membersRoutes = createMembersRoutes(getMembersService);
