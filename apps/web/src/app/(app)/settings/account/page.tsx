import { redirect } from "next/navigation";
import type { JSX } from "react";
import { AccountEmailCard } from "@/features/auth/components/account-email-card";
import { AccountProfileCard } from "@/features/auth/components/account-profile-card";
import { ChangePasswordCard } from "@/features/auth/components/change-password-card";
import { DeleteAccountCard } from "@/features/auth/components/delete-account-card";
import { LinkedAccountsSection } from "@/features/auth/components/linked-accounts-section";
import { SessionsCard } from "@/features/auth/components/sessions-card";
import { routes } from "@/lib/routes";
import { getServerSession } from "@/lib/server-session";

export const instant = false;

/**
 * Settings → Account (docs/23 §6). Every card is a client component driven by a
 * hook; this page only resolves the session and lays the screen out.
 */
export default async function AccountSettingsPage(): Promise<JSX.Element> {
  const session = await getServerSession();

  if (session === null) {
    redirect(`${routes.signIn}?next=${encodeURIComponent(routes.accountSettings)}`);
  }

  const isDemo = session.user.isDemo === true;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          Profile, sign-in methods and sessions for {session.user.email}.
        </p>
      </div>

      <AccountProfileCard name={session.user.name} isDemo={isDemo} />
      <AccountEmailCard
        email={session.user.email}
        emailVerified={session.user.emailVerified === true}
      />
      <ChangePasswordCard isDemo={isDemo} />
      <LinkedAccountsSection />
      <SessionsCard />
      <DeleteAccountCard isDemo={isDemo} />
    </div>
  );
}
