"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { useDeleteAccount } from "../hooks/use-delete-account";

/** Settings → Account: type-to-confirm account deletion (blocked for demo). */
export function DeleteAccountCard({ isDemo }: { isDemo: boolean }): JSX.Element {
  const { form, onSubmit, isDeleting, formError, isDemo: demo } = useDeleteAccount(isDemo);
  const errors = form.formState.errors;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently removes your account, sessions and linked sign-in methods.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {demo ? (
            <Alert>
              <AlertTitle>Read-only demo account</AlertTitle>
              <AlertDescription>
                The demo account cannot be deleted. Create your own account to try this.
              </AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={errors.confirm !== undefined}>
                <FieldLabel htmlFor="delete-confirm">Type DELETE to confirm</FieldLabel>
                <Input
                  id="delete-confirm"
                  autoComplete="off"
                  aria-invalid={errors.confirm !== undefined}
                  aria-describedby={
                    errors.confirm === undefined ? undefined : "delete-confirm-error"
                  }
                  disabled={demo}
                  {...form.register("confirm")}
                />
                <FieldError id="delete-confirm-error" errors={[errors.confirm]} />
              </Field>
            </FieldGroup>

            {formError === null ? null : (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <div>
              <Button type="submit" variant="destructive" disabled={isDeleting || demo}>
                {isDeleting ? <Spinner data-icon="inline-start" /> : null}
                Delete my account
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
