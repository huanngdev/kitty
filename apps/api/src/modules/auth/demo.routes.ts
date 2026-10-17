import { Hono } from "hono";
import { signInAsDemoOrganizer } from "./demo.service";

/**
 * Demo login. Mounted at `/api/demo-sign-in`, outside `/api/auth/*` so Better
 * Auth's catch-all handler does not swallow it. The demo password stays on the
 * server (AGENTS.md invariant #11).
 */
export const demoRoutes = new Hono().post("/demo-sign-in", async (c) => {
  const response = await signInAsDemoOrganizer(c.req.raw.headers);

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});
