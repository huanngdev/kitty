import { healthResponseSchema } from "@kitty/shared/health";
import { Hono } from "hono";

/** Service/system routes, mounted under `/api`. */
export const systemRoutes = new Hono().get("/health", (c) =>
  c.json(healthResponseSchema.parse({ ok: true })),
);
