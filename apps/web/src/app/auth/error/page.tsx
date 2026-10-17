import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LinkButton } from "@/components/link-button";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { oauthErrorMessage } from "@/features/auth/lib/auth-error";
import { routes } from "@/lib/routes";
import type { JSX } from "react";

export const instant = false;

/**
 * Better Auth's `errorCallbackURL` for OAuth failures. The code is mapped to
 * friendly copy; the raw provider error (which can echo state/token internals)
 * is never rendered.
 */
export default async function AuthErrorPage({
  searchParams,
}: PageProps<"/auth/error">): Promise<JSX.Element> {
  const params = await searchParams;
  const code = typeof params.error === "string" ? params.error : null;

  return (
    <AuthShell
      title="Couldn't sign you in"
      description="Nothing was charged and no account was changed."
    >
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>Sign-in didn&apos;t finish</AlertTitle>
          <AlertDescription>{oauthErrorMessage(code)}</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={routes.signIn}>Try again</LinkButton>
          <LinkButton variant="outline" href={routes.forgotPassword}>
            Reset your password
          </LinkButton>
        </div>
      </div>
    </AuthShell>
  );
}
