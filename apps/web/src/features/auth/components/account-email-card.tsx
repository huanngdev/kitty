"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { useResendVerification } from "../hooks/use-resend-verification";

interface AccountEmailCardProps {
  email: string;
  emailVerified: boolean;
}

/** Settings → Account: email status + resend verification. */
export function AccountEmailCard({ email, emailVerified }: AccountEmailCardProps): JSX.Element {
  const { resend, isPending, message, isError } = useResendVerification();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          {emailVerified
            ? "Your address is confirmed."
            : "Confirm your address to secure password recovery."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="font-medium">{email}</span>{" "}
            <span className="text-muted-foreground">
              {emailVerified ? "· verified" : "· unverified"}
            </span>
          </p>
          {emailVerified ? null : (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => resend(email)}
                disabled={isPending}
              >
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                Resend verification email
              </Button>
            </div>
          )}
          {message === null ? null : (
            <p className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
