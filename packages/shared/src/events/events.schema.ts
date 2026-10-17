import { CATEGORIES } from "@kitty/leash";
import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { moneyWireSchema } from "../leash-admin/money.schema";

/**
 * Event contracts for the Web App API (docs/09-data-model.md §2,
 * docs/10-api-spec.md §4).
 *
 * An event is the kitty's scope: one organizer owns it, the gateway mirrors it
 * as a kitty (Stripe calls it a pooled fund). Money crosses the wire as a
 * decimal string (`"2500.00"`, AGENTS.md invariant #4); inside `apps/api` it is
 * integer cents parsed with `@kitty/ledger`.
 */

/** Event lifecycle (docs/09 §2), the same list the DB stores. */
export const eventStatusSchema = z.enum([
  "planning",
  "collecting",
  "active",
  "settling",
  "settled",
]);

export type EventStatus = z.infer<typeof eventStatusSchema>;

/**
 * Budget / vendor category (docs/09 §2). Imported from `@kitty/leash` so the
 * event category list can never drift from the leash policy engine.
 */
export const categorySchema = z.enum(CATEGORIES);

export type Category = z.infer<typeof categorySchema>;

/** Fields shared by create and update, before per-operation optionality. */
const eventInputFields = {
  title: z.string().min(1).max(120),
  description: z.string().max(2000).nullable(),
  location: z.string().max(200).nullable(),
  timezone: z.string().min(1).max(64),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  currency: z.literal("USD"),
  budget: moneyWireSchema,
  perMember: moneyWireSchema.nullable(),
} as const;

/** `POST /api/events` body. The organizer comes from the session, not the body. */
export const createEventSchema = z.object({
  title: eventInputFields.title,
  description: eventInputFields.description.default(null),
  location: eventInputFields.location.default(null),
  timezone: eventInputFields.timezone.default("Asia/Ho_Chi_Minh"),
  startsOn: eventInputFields.startsOn,
  endsOn: eventInputFields.endsOn,
  currency: eventInputFields.currency.default("USD"),
  budget: eventInputFields.budget,
  perMember: eventInputFields.perMember.default(null),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

/** `PATCH /api/events/:id` body — every field optional, `status` included. */
export const updateEventSchema = z.object({
  title: eventInputFields.title.optional(),
  description: eventInputFields.description.optional(),
  location: eventInputFields.location.optional(),
  timezone: eventInputFields.timezone.optional(),
  startsOn: eventInputFields.startsOn.optional(),
  endsOn: eventInputFields.endsOn.optional(),
  currency: eventInputFields.currency.optional(),
  budget: eventInputFields.budget.optional(),
  perMember: eventInputFields.perMember.optional(),
  status: eventStatusSchema.optional(),
});

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** An event as returned by the API (docs/10-api-spec.md §4). */
export const eventSchema = z.object({
  id: idSchema(idPrefixes.event),
  organizerId: z.string().min(1),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  timezone: z.string(),
  /** `YYYY-MM-DD` (a calendar date, not an instant). */
  startsOn: z.string(),
  endsOn: z.string(),
  currency: z.string().min(1),
  budget: moneyWireSchema,
  perMember: moneyWireSchema.nullable(),
  status: eventStatusSchema,
  /** The gateway kitty for this event, or `null` until it exists. */
  kittyId: idSchema(idPrefixes.kitty).nullable(),
  createdAt: z.string(),
});

export type Event = z.infer<typeof eventSchema>;

/** `GET /api/events` (mine) response. */
export const eventListResponseSchema = z.object({ items: z.array(eventSchema) });

export type EventListResponse = z.infer<typeof eventListResponseSchema>;

/** Response body of `GET /api/events/:id`, `POST /api/events` and `PATCH`. */
export const eventDetailResponseSchema = eventSchema;

export type EventDetailResponse = z.infer<typeof eventDetailResponseSchema>;
