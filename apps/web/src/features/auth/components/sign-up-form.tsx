"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { useSignUpForm } from "../hooks/use-sign-up-form";
import { PasswordStrengthMeter } from "./password-strength-meter";

/** Account creation with email + password (docs/23 F1). */
export function SignUpForm(): JSX.Element {
  const { form, onSubmit, isSubmitting, formError, strength } = useSignUpForm();
  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.name !== undefined}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Mai"
            aria-invalid={errors.name !== undefined}
            aria-describedby={errors.name === undefined ? undefined : "name-error"}
            {...form.register("name")}
          />
          <FieldError id="name-error" errors={[errors.name]} />
        </Field>

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
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.password !== undefined}
            aria-describedby={errors.password === undefined ? "password-hint" : "password-error"}
            {...form.register("password")}
          />
          <FieldDescription id="password-hint">At least 8 characters.</FieldDescription>
          <PasswordStrengthMeter strength={strength} />
          <FieldError id="password-error" errors={[errors.password]} />
        </Field>

        <Field data-invalid={errors.confirmPassword !== undefined}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
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
          <AlertTitle>Couldn&apos;t create your account</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Create account
      </Button>
    </form>
  );
}
