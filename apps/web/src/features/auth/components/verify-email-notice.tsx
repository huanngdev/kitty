"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { useResendVerificationForm } from "../hooks/use-resend-verification-form";

interface VerifyEmailNoticeProps {
  initialEmail: string | null;
  showDevHint: boolean;
}

/** "Check your inbox" screen shown after sign-up and from the unverified banner. */
export function VerifyEmailNotice({
  initialEmail,
  showDevHint,
}: VerifyEmailNoticeProps): JSX.Element {
  const { email, setEmail, onSubmit, canSubmit, isPending, message, isError } =
    useResendVerificationForm(initialEmail);

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>
          We sent a verification link to your email. It expires in 24 hours.
        </AlertDescription>
      </Alert>

      {showDevHint ? (
        <p className="text-xs text-muted-foreground">
          Local development: the link is printed in the API server console.
        </p>
      ) : null}

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="resend-email">Email</FieldLabel>
            <Input
              id="resend-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
        </FieldGroup>
        <Button type="submit" variant="outline" disabled={!canSubmit}>
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          Resend verification email
        </Button>
      </form>

      {message === null ? null : (
        <p
          role="status"
          className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message}
        </p>
      )}
    </div>
  );
}
