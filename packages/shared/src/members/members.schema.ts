import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";

/**
 * Member contracts for the Web App API (docs/09-data-model.md §2,
 * docs/10-api-spec.md §4).
 *
 * A member is a person who owes a share of the kitty. `member_token` is the
 * secret of the no-login member portal link, so it is part of the organizer's
 * member view; agents never see it (docs/12).
 */

/** Emails are stored lowercase so `UNIQUE (event_id, email)` can't be bypassed by case. */
export const memberEmailSchema = z
  .email()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => value.length > 0, { error: "email is required" });

export type MemberEmail = z.infer<typeof memberEmailSchema>;

/** `POST /api/events/:id/members` body. */
export const createMemberSchema = z.object({
  name: z.string().min(1).max(120),
  /** Invoice recipient email (sandbox personal account). */
  email: memberEmailSchema,
  /** Relative contribution weight; `1` means the default equal share. */
  shareWeight: z.number().positive().max(999.999).default(1),
  slackHandle: z.string().max(64).nullable().default(null),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const memberSchema = z.object({
  id: idSchema(idPrefixes.member),
  eventId: idSchema(idPrefixes.event),
  name: z.string(),
  email: z.string(),
  shareWeight: z.number(),
  /** Secret token for the no-login portal link; only the organizer receives it. */
  memberToken: z.string(),
  slackHandle: z.string().nullable(),
});

export type Member = z.infer<typeof memberSchema>;

/** `GET /api/events/:id/members` response. */
export const memberListResponseSchema = z.object({ items: z.array(memberSchema) });

export type MemberListResponse = z.infer<typeof memberListResponseSchema>;

/** Response body of `POST /api/events/:id/members`. */
export const memberDetailResponseSchema = memberSchema;

export type MemberDetailResponse = z.infer<typeof memberDetailResponseSchema>;

/** `DELETE /api/events/:id/members/:memberId` response. */
export const deleteMemberResponseSchema = z.object({ id: idSchema(idPrefixes.member) });

export type DeleteMemberResponse = z.infer<typeof deleteMemberResponseSchema>;
