"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Cat } from "lucide-react";
import type { JSX } from "react";
import { useDemoLoginStatus } from "../hooks/use-demo-login-status";
import { useDemoSignIn } from "../hooks/use-demo-sign-in";

/**
 * One-click sign-in with the seeded demo organizer (docs/23 F1 step 1).
 *
 * Rendered only when `GET /api/demo-sign-in/status` reports the deployment
 * enabled it — ordinary deployments never show the button, and the endpoint
 * 404s anyway.
 */
export function DemoSignInButton(): JSX.Element | null {
  const { enabled, isLoading } = useDemoLoginStatus();
  const { signInAsDemo, isPending, error } = useDemoSignIn();

  if (isLoading || !enabled) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" onClick={signInAsDemo} disabled={isPending}>
        {isPending ? <Spinner data-icon="inline-start" /> : <Cat data-icon="inline-start" />}
        Continue as demo organizer
      </Button>
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
