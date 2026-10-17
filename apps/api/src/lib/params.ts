import { idPrefixes, idSchema } from "@kitty/shared";
import { z } from "zod";

/** Path-param schemas for the Web App API routes (CODE_RULES.md §D). */

export const eventIdParamSchema = z.object({ id: idSchema(idPrefixes.event) });

export const memberIdParamSchema = z.object({
  id: idSchema(idPrefixes.event),
  memberId: idSchema(idPrefixes.member),
});

export const vendorIdParamSchema = z.object({
  id: idSchema(idPrefixes.event),
  vendorId: idSchema(idPrefixes.vendor),
});
