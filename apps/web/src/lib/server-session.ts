import { authSessionSchema, type AuthSessionPayload } from "@kitty/shared/auth";
import { cookies } from "next/headers";
import { getServerEnv } from "./env";

/**
 * Asks `apps/api` who owns this cookie header. Returns `null` for a missing,
 * expired, malformed or forged session.
 *
 * Used by `getServerSession()` (pages, layouts) and by `proxy.ts`, which needs
 * the same truth to decide whether a visitor may skip the auth screens. The
 * call goes to the internal `API_URL`, not the public origin: the web server
 * must not depend on its own public URL being reachable from inside.
 */
export async function readSession(cookieHeader: string): Promise<AuthSessionPayload | null> {
  if (cookieHeader.length === 0) {
    return null;
  }

  try {
    const response = await fetch(`${getServerEnv().API_URL}/api/auth/get-session`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    const parsed = authSessionSchema.nullable().safeParse(payload);

    return parsed.success ? parsed.data : null;
  } catch {
    // The API being unreachable is treated as "signed out" so the shell renders
    // the sign-in redirect instead of crashing the request.
    return null;
  }
}

/**
 * Reads the Better Auth session on the server.
 *
 * `apps/api` owns Better Auth, so the web app never imports the auth instance:
 * it calls `GET /api/auth/get-session` with the visitor's cookies
 * (docs/25-code-architecture.md §1). Returns `null` for a missing, expired or
 * malformed session.
 */
export async function getServerSession(): Promise<AuthSessionPayload | null> {
  return readSession((await cookies()).toString());
}
