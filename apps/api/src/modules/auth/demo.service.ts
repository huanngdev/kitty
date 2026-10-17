import { env } from "../../env";
import { getAuth } from "../../lib/auth";
import { AppError } from "../../lib/errors";

/** Seeded by `bun run seed:demo-users` (docs/23-user-screen-flow.md §2). */
const DEMO_ORGANIZER_EMAIL = "organizer@demo.kitty";

/**
 * Whether this deployment exposes the one-click demo login.
 *
 * Off by default so a normal deployment can never sign anyone into the demo
 * account; the judge demo sets `DEMO_LOGIN_ENABLED=true`.
 */
export function isDemoLoginEnabled(): boolean {
  return env.DEMO_LOGIN_ENABLED;
}

/**
 * Signs the browser in as the demo organizer without ever shipping the demo
 * password to the client.
 *
 * Returns Better Auth's raw response so the `Set-Cookie` header reaches the
 * browser through the same-origin `/api` proxy.
 */
export async function signInAsDemoOrganizer(headers: Headers): Promise<Response> {
  const password = env.DEMO_USER_PASSWORD;

  if (password === undefined) {
    throw new AppError("DEMO_LOGIN_NOT_CONFIGURED", 503, {
      hint: "Set DEMO_USER_PASSWORD in apps/api/.env and run the demo seed.",
    });
  }

  const response = await getAuth().api.signInEmail({
    body: { email: DEMO_ORGANIZER_EMAIL, password },
    headers,
    asResponse: true,
  });

  if (!response.ok) {
    // 401 means the demo account exists with a different password (or was not
    // seeded). Surface a clear, secret-free error instead of Better Auth's body.
    throw new AppError("DEMO_LOGIN_FAILED", 401, {
      hint: "Run `bun run seed:demo-users` with the current DEMO_USER_PASSWORD.",
    });
  }

  return response;
}
