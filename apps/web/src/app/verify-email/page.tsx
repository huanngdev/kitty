import type { JSX } from "react";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { VerifyEmailNotice } from "@/features/auth/components/verify-email-notice";
import { VerifyEmailResult } from "@/features/auth/components/verify-email-result";
import { getServerSession } from "@/lib/server-session";

export const instant = false;

/**
 * One screen for three states: consuming a `?token=`, "check your inbox" after
 * sign-up, and the resend form reached from the unverified banner.
 */
export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">): Promise<JSX.Element> {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const email = typeof params.email === "string" ? params.email : null;
  const session = token === null ? await getServerSession() : null;

  return (
    <AuthShell
      title={token === null ? "Verify your email" : "Verifying your email"}
      description={
        token === null
          ? "One click confirms the address on your account."
          : "Hang tight — this only takes a second."
      }
    >
      {token === null ? (
        <VerifyEmailNotice
          initialEmail={email ?? session?.user.email ?? null}
          showDevHint={process.env.NODE_ENV !== "production"}
        />
      ) : (
        <VerifyEmailResult token={token} />
      )}
    </AuthShell>
  );
}
