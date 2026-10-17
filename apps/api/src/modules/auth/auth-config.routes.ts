import { authConfigSchema } from "@kitty/shared/auth";
import { Hono } from "hono";
import { env } from "../../env";
import { type AuthEnvInput, toPublicAuthConfig } from "../../lib/auth-config";

/**
 * `GET /api/auth-config` (docs/10-api-spec.md §4, ADR-029).
 *
 * Public and unauthenticated on purpose: the sign-in and sign-up screens need
 * to know which buttons to render before anybody is signed in. The payload is
 * derived from env only — provider ids and booleans, never a secret.
 */
export function createAuthConfigRoutes(source: AuthEnvInput = env): Hono {
  return new Hono().get("/auth-config", (c) =>
    c.json(authConfigSchema.parse(toPublicAuthConfig(source))),
  );
}

export const authConfigRoutes = createAuthConfigRoutes();
