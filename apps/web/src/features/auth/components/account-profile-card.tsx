"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { useAccountProfile } from "../hooks/use-account-profile";

interface AccountProfileCardProps {
  name: string;
  isDemo: boolean;
}

/** Settings → Account: display name and read-only email. */
export function AccountProfileCard({ name, isDemo }: AccountProfileCardProps): JSX.Element {
  const {
    form,
    onSubmit,
    isSaving,
    formError,
    saved,
    isDemo: demo,
  } = useAccountProfile(name, isDemo);
  const errors = form.formState.errors;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How Kitty addresses you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={errors.name !== undefined}>
              <FieldLabel htmlFor="account-name">Name</FieldLabel>
              <Input
                id="account-name"
                autoComplete="name"
                aria-invalid={errors.name !== undefined}
                aria-describedby={errors.name === undefined ? undefined : "account-name-error"}
                disabled={demo}
                {...form.register("name")}
              />
              {errors.name === undefined ? null : (
                <p id="account-name-error" className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </Field>
          </FieldGroup>

          {demo ? (
            <p className="text-sm text-muted-foreground">
              The demo account is read-only. Create your own account to edit settings.
            </p>
          ) : null}

          {formError === null ? null : (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          {saved ? <p className="text-sm text-muted-foreground">Name saved.</p> : null}

          <div>
            <Button type="submit" disabled={isSaving || demo}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
