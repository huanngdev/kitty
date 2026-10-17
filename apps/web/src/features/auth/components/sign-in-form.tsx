"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import type { JSX } from "react";
import { useSignInForm } from "../hooks/use-sign-in-form";
import { routes } from "@/lib/routes";

/** Email + password sign-in (docs/23-user-screen-flow.md F1). */
export function SignInForm({ nextPath }: { nextPath: string | null }): JSX.Element {
  const {
    form,
    onSubmit,
    isSubmitting,
    formError,
    errorKind,
    resendVerification,
    isResending,
    resendMessage,
  } = useSignInForm(nextPath);
  const errors = form.formState.errors;

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

        <Field data-invalid={errors.password !== undefined}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href={routes.forgotPassword}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password !== undefined}
            aria-describedby={errors.password === undefined ? undefined : "password-error"}
            {...form.register("password")}
          />
          <FieldError id="password-error" errors={[errors.password]} />
        </Field>
      </FieldGroup>

      {formError === null ? null : (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t sign in</AlertTitle>
          <AlertDescription>
            <p>{formError}</p>
            {errorKind === "email_not_verified" ? (
              <div className="mt-3 flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resendVerification}
                  disabled={isResending}
                >
                  {isResending ? <Spinner data-icon="inline-start" /> : null}
                  Resend verification email
                </Button>
                {resendMessage === null ? null : <p className="text-xs">{resendMessage}</p>}
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Sign in
      </Button>
    </form>
  );
}
