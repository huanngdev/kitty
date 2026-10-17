"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MailWarning } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";
import { routes } from "@/lib/routes";
import { useResendVerification } from "../hooks/use-resend-verification";

/**
 * Shown above the app while the signed-in user's email is unverified. This is
 * the development experience (verification required is off) and a reminder in
 * production if somebody signed in before confirming.
 */
export function UnverifiedEmailBanner({ email }: { email: string }): JSX.Element {
  const { resend, isPending, message, isError } = useResendVerification(routes.events);

  return (
    <Alert>
      <MailWarning aria-hidden />
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription>
        <p>
          We sent a link to <span className="font-medium">{email}</span>. Confirm it to secure your
          account.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => resend(email)}
            disabled={isPending}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            Resend email
          </Button>
          <Link
            href={`${routes.verifyEmail}?sent=1`}
            className="text-xs underline-offset-4 hover:underline"
          >
            Having trouble?
          </Link>
        </div>
        {message === null ? null : (
          <p className={isError ? "mt-2 text-xs text-destructive" : "mt-2 text-xs"}>{message}</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
