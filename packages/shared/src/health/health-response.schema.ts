import { z } from "zod";

/** Health payload every Kitty service returns from `GET /health`. */
export const healthResponseSchema = z.object({
  ok: z.literal(true),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
