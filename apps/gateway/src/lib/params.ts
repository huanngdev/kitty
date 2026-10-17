import { idPrefixes, idSchema } from "@kitty/shared";
import { z } from "zod";

/** Path-param schemas shared by the `/v1` routes (CODE_RULES.md §D). */

export const kittyIdParamSchema = z.object({ id: idSchema(idPrefixes.kitty) });

export const leashIdParamSchema = z.object({ id: idSchema(idPrefixes.leash) });

export const payeeParamSchema = z.object({
  id: idSchema(idPrefixes.kitty),
  email: z.string().min(3),
});
