import { Hono } from "hono";

/**
 * Leash Gateway.
 *
 * This is the ONLY service allowed to hold PayPal secrets (AGENTS.md invariant
 * #1). The money path (`verify -> policy -> reserve -> step-up -> PayPal`) lands
 * in later tasks; for now this is a health-checkable skeleton with no business
 * logic.
 */
export const app = new Hono();

app.get("/health", (c) => {
  return c.json({ ok: true });
});

export type GatewayApp = typeof app;
