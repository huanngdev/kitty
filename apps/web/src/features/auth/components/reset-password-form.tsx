"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { routes } from "@/lib/routes";
import { useResetPassword } from "../hooks/use-reset-password";

/** Consumes the reset token; handles missing, invalid and expired tokens. */
export function ResetPasswordForm({ token }: { token: string | null }): JSX.Element {
  const { form, onSubmit, isSubmitting, isReset, formError, isTokenInvalid } =
    useResetPassword(token);
  const errors = form.formState.errors;

  if (isReset) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>
            Every other device has been signed out. Use your new password to sign in.
          </AlertDescription>
        </Alert>
        <LinkButton href={routes.signIn}>Sign in</LinkButton>
      </div>
    );
  }

  if (isTokenInvalid) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>This link is invalid or expired</AlertTitle>
          <AlertDescription>
            Reset links expire after 1 hour. Request a new one to continue.
          </AlertDescription>
        </Alert>
        <LinkButton variant="outline" href={routes.forgotPassword}>
          Request a new link
        </LinkButton>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.newPassword !== undefined}>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.newPassword !== undefined}
            aria-describedby={
              errors.newPassword === undefined ? "password-hint" : "new-password-error"
            }
            {...form.register("newPassword")}
          />
          <p id="password-hint" className="text-sm text-muted-foreground">
            At least 8 characters.
          </p>
          <FieldError id="new-password-error" errors={[errors.newPassword]} />
        </Field>

        <Field data-invalid={errors.confirmPassword !== undefined}>
          <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.confirmPassword !== undefined}
            aria-describedby={
              errors.confirmPassword === undefined ? undefined : "confirm-password-error"
            }
            {...form.register("confirmPassword")}
          />
          <FieldError id="confirm-password-error" errors={[errors.confirmPassword]} />
        </Field>
      </FieldGroup>

      {formError === null ? null : (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t reset your password</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Set new password
      </Button>
    </form>
  );
}
