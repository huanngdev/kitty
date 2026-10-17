import type { z } from "zod";
import type {
  leashActivityItemSchema,
  leashActivityOutputSchema,
  leashCheckInputSchema,
  leashCheckOutputSchema,
  leashIntentStatusInputSchema,
  leashIntentStatusOutputSchema,
  leashRequestPayoutInputSchema,
  leashRequestPayoutOutputSchema,
  leashStatusOutputSchema,
} from "./leash-agent.schema";

/** Inferred types of the Gateway Agent API (MCP) contracts (docs/10 §2). */

export type LeashStatusOutput = z.infer<typeof leashStatusOutputSchema>;
export type LeashCheckInput = z.infer<typeof leashCheckInputSchema>;
export type LeashCheckOutput = z.infer<typeof leashCheckOutputSchema>;
export type LeashRequestPayoutInput = z.infer<typeof leashRequestPayoutInputSchema>;
export type LeashRequestPayoutOutput = z.infer<typeof leashRequestPayoutOutputSchema>;
export type LeashIntentStatusInput = z.infer<typeof leashIntentStatusInputSchema>;
export type LeashIntentStatusOutput = z.infer<typeof leashIntentStatusOutputSchema>;
export type LeashActivityItem = z.infer<typeof leashActivityItemSchema>;
export type LeashActivityOutput = z.infer<typeof leashActivityOutputSchema>;
