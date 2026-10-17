"use client";

import { Button } from "@kitty/ui/components/button";
import { Spinner } from "@kitty/ui/components/spinner";
import { Cat } from "lucide-react";
import type { JSX } from "react";
import { useDemoSignIn } from "../hooks/use-demo-sign-in";

/** One-click sign-in with the seeded demo organizer (docs/23 F1 step 1). */
export function DemoSignInButton(): JSX.Element {
  const { signInAsDemo, isPending, error } = useDemoSignIn();

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
