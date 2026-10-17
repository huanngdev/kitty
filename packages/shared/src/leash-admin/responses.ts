import { z } from "zod";
import { cursorPageSchema } from "../common/pagination.schema";
import { agentSchema } from "./agents.schema";
import { auditEventSchema } from "./audit.schema";
import { contributionSchema } from "./contributions.schema";
import { spendIntentSchema } from "./intents.schema";
import { leashListItemSchema } from "./leashes.schema";
import { ledgerEntrySchema } from "./ledger.schema";
import { verifiedPayeeSchema } from "./payees.schema";

/** Response schemas of the Gateway Admin API (docs/10-api-spec.md §1). */

export const agentResponseSchema = agentSchema;

export const payeeListResponseSchema = z.object({ items: z.array(verifiedPayeeSchema) });

export const leashListResponseSchema = z.object({ items: z.array(leashListItemSchema) });

export const contributionListResponseSchema = z.object({ items: z.array(contributionSchema) });

export const intentListResponseSchema = z.object({ items: z.array(spendIntentSchema) });

export const ledgerPageSchema = cursorPageSchema(ledgerEntrySchema);

export const auditPageSchema = cursorPageSchema(auditEventSchema);
