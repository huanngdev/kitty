import { authSessionSchema, type AuthSessionPayload } from "@kitty/shared/auth";
import { cookies } from "next/headers";
import { clientEnv } from "./env";

/**
 * Reads the Better Auth session on the server.
 *
 * `apps/api` owns Better Auth, so the web app never imports the auth instance:
 * it calls `GET /api/auth/get-session` through the same-origin `/api` rewrite
 * with the visitor's cookies (docs/25-code-architecture.md §1). Returns `null`
 * for a missing, expired or malformed session.
 */
export async function getServerSession(): Promise<AuthSessionPayload | null> {
  const cookieHeader = (await cookies()).toString();

  if (cookieHeader.length === 0) {
    return null;
  }

  try {
    const response = await fetch(`${clientEnv.NEXT_PUBLIC_APP_URL}/api/auth/get-session`, {
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
