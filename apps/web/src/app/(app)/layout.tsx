import { redirect } from "next/navigation";
import type { JSX, ReactNode } from "react";
import { AppShell } from "@/features/shell/components/app-shell";
import { routes } from "@/lib/routes";
import { getServerSession } from "@/lib/server-session";

export const instant = false;

/**
 * The app area. Route protection is optimistic in `proxy.ts`; this is the real
 * server-side session check (Better Auth Next.js guide). Every page below this
 * layout can trust that a user is present.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const session = await getServerSession();

  if (session === null) {
    redirect(routes.signIn);
  }

  return (
    <AppShell
      name={session.user.name}
      email={session.user.email}
      emailVerified={session.user.emailVerified === true}
    >
      {children}
    </AppShell>
  );
}
