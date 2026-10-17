"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LinkButton } from "@/components/link-button";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { routes } from "@/lib/routes";
import { useAuthConfig } from "../hooks/use-auth-config";
import { ForgotPasswordForm } from "./forgot-password-form";

interface ForgotPasswordScreenProps {
  showDevHint: boolean;
}

/**
 * `/forgot-password`. On a deployment that cannot deliver reset emails
 * (production without a transactional mailer, ADR-029) this shows a short
 * explanation instead of a form that could never work.
 */
export function ForgotPasswordScreen({ showDevHint }: ForgotPasswordScreenProps): JSX.Element {
  const { passwordReset, isLoading } = useAuthConfig();

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner /> Loading…
      </p>
    );
  }

  if (!passwordReset) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>Password reset is not available on this deployment</AlertTitle>
          <AlertDescription>
            This deployment cannot send emails yet, so there is no way to reset a forgotten
            password. Ask the operator to configure a mailer, or contact whoever set up your
            account.
          </AlertDescription>
        </Alert>
        <LinkButton variant="outline" href={routes.signIn}>
          Back to sign in
        </LinkButton>
      </div>
    );
  }

  return <ForgotPasswordForm showDevHint={showDevHint} />;
}
