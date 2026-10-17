"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { useChangePassword } from "../hooks/use-change-password";

/** Settings → Account: password change (requires the current password). */
export function ChangePasswordCard({ isDemo }: { isDemo: boolean }): JSX.Element {
  const { form, onSubmit, isSaving, formError, saved, isDemo: demo } = useChangePassword(isDemo);
  const errors = form.formState.errors;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Changing it signs out every other device. You need the current password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={errors.currentPassword !== undefined}>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.currentPassword !== undefined}
                aria-describedby={
                  errors.currentPassword === undefined ? undefined : "current-password-error"
                }
                disabled={demo}
                {...form.register("currentPassword")}
              />
              <FieldError id="current-password-error" errors={[errors.currentPassword]} />
            </Field>

            <Field data-invalid={errors.newPassword !== undefined}>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.newPassword !== undefined}
                aria-describedby={
                  errors.newPassword === undefined ? "new-password-hint" : "new-password-error"
                }
                disabled={demo}
                {...form.register("newPassword")}
              />
              <p id="new-password-hint" className="text-sm text-muted-foreground">
                At least 8 characters.
              </p>
              <FieldError id="new-password-error" errors={[errors.newPassword]} />
            </Field>

            <Field data-invalid={errors.confirmPassword !== undefined}>
              <FieldLabel htmlFor="confirm-new-password">Confirm new password</FieldLabel>
              <Input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.confirmPassword !== undefined}
                aria-describedby={
                  errors.confirmPassword === undefined ? undefined : "confirm-new-password-error"
                }
                disabled={demo}
                {...form.register("confirmPassword")}
              />
              <FieldError id="confirm-new-password-error" errors={[errors.confirmPassword]} />
            </Field>
          </FieldGroup>

          {demo ? (
            <p className="text-sm text-muted-foreground">
              The demo account is read-only. Create your own account to set a password.
            </p>
          ) : null}
          {formError === null ? null : (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          {saved ? (
            <p className="text-sm text-muted-foreground">
              Password updated. Other devices are signed out.
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={isSaving || demo}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
