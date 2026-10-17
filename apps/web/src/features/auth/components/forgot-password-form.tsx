"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { useForgotPassword } from "../hooks/use-forgot-password";
import { routes } from "@/lib/routes";

interface ForgotPasswordFormProps {
  showDevHint: boolean;
}

/** Requests a reset link; the outcome message is identical for every address. */
export function ForgotPasswordForm({ showDevHint }: ForgotPasswordFormProps): JSX.Element {
  const { form, onSubmit, isSubmitting, isSent, formError } = useForgotPassword();
  const errors = form.formState.errors;

  if (isSent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>
            If an account exists for that address, we sent a link to reset its password. The link
            expires in 1 hour.
          </AlertDescription>
        </Alert>
        {showDevHint ? (
          <p className="text-xs text-muted-foreground">
            Local development: the link is printed in the API server console.
          </p>
        ) : null}
        <LinkButton variant="outline" href={routes.signIn}>
          Back to sign in
        </LinkButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.email !== undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={errors.email !== undefined}
            aria-describedby={errors.email === undefined ? undefined : "email-error"}
            {...form.register("email")}
          />
          <FieldError id="email-error" errors={[errors.email]} />
        </Field>
      </FieldGroup>

      {formError === null ? null : (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t send the link</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Send reset link
      </Button>
    </form>
  );
}
