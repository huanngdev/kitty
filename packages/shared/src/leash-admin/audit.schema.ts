import { z } from "zod";
import { idPrefixes, idSchema } from "../common/ids";
import { paginationQuerySchema } from "../common/pagination.schema";

/**
 * Audit contracts for `GET /v1/kitties/:id/audit` (docs/10-api-spec.md §1).
 *
 * Every admin mutation writes one `leash.audit_events` row (actor user id,
 * action type, before/after summary — never secrets). The table is append-only.
 */

export const auditEventSchema = z.object({
  id: z.number().int().nonnegative(),
  kittyId: idSchema(idPrefixes.kitty),
  /** `user:{id}` | `agent:{id}` | `paypal` | `system`. */
  actor: z.string().min(1),
  type: z.string().min(1),
  data: z.unknown(),
  createdAt: z.string(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

/** `GET /v1/kitties/:id/audit?cursor=` query. */
export const auditQuerySchema = paginationQuerySchema;

export type AuditQuery = z.infer<typeof auditQuerySchema>;
