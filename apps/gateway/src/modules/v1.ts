import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { type AdminEnv, adminAuth } from "../admin/auth";
import { agentsRoutes } from "./agents/agents.routes";
import { auditRoutes } from "./audit/audit.routes";
import { kittiesRoutes } from "./kitties/kitties.routes";
import { kittyLeashesRoutes, leashesRoutes } from "./leashes/leashes.routes";
import { payeesRoutes } from "./payees/payees.routes";

/**
 * The `/v1` Gateway Admin API router (docs/10-api-spec.md §1).
 *
 * `auth` is passed in so tests can inject a token without a real environment;
 * the app passes the env-backed {@link adminAuth}.
 */
export function createV1Routes(auth: MiddlewareHandler<AdminEnv>): Hono<AdminEnv> {
  const v1 = new Hono<AdminEnv>();

  v1.use("*", auth);

  v1.route("/kitties", kittiesRoutes);
  v1.route("/kitties", kittyLeashesRoutes);
  v1.route("/kitties", payeesRoutes);
  v1.route("/kitties", auditRoutes);
  v1.route("/agents", agentsRoutes);
  v1.route("/leashes", leashesRoutes);

  return v1;
}

/** The `/v1` API mounted by the gateway app. */
export const v1Routes = createV1Routes(adminAuth);
