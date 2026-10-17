"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LinkButton } from "@/components/link-button";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { useVerifyEmail } from "../hooks/use-verify-email";
import { routes } from "@/lib/routes";

/** Result screen for `/verify-email?token=…`. */
export function VerifyEmailResult({ token }: { token: string | null }): JSX.Element {
  const { state } = useVerifyEmail(token);

  switch (state.status) {
    case "verifying":
      return (
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <Spinner />
          Verifying your email…
        </div>
      );
    case "verified":
      return (
        <div className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>Email verified</AlertTitle>
            <AlertDescription>You&apos;re all set. Welcome to Kitty.</AlertDescription>
          </Alert>
          <LinkButton href={routes.events}>Go to your events</LinkButton>
        </div>
      );
    case "invalid":
      return (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertTitle>This link is invalid or expired</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`${routes.verifyEmail}?sent=1`}>Send a new link</LinkButton>
            <LinkButton variant="outline" href={routes.signIn}>
              Back to sign in
            </LinkButton>
          </div>
        </div>
      );
  }
}
