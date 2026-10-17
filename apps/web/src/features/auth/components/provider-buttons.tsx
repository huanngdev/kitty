"use client";

import type { SocialProviderId } from "@kitty/shared/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { JSX } from "react";
import { GitHubMark } from "@/components/brand/github-mark";
import { PayPalMark } from "@/components/brand/paypal-mark";
import { useSocialSignIn } from "../hooks/use-social-sign-in";

interface ProviderButtonsProps {
  providers: SocialProviderId[];
  nextPath: string | null;
}

const LABELS: Record<SocialProviderId, string> = {
  github: "Continue with GitHub",
  paypal: "Continue with PayPal",
};

/**
 * "Continue with …" buttons for the providers `/api/auth-config` reported.
 * Every button has its own loading state so a slow PayPal redirect does not
 * disable the GitHub button's feedback (all stay disabled while one runs).
 */
export function ProviderButtons({ providers, nextPath }: ProviderButtonsProps): JSX.Element | null {
  const { signInWith, pendingProvider, error } = useSocialSignIn(nextPath);

  if (providers.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          onClick={() => signInWith(provider)}
          disabled={pendingProvider !== null}
          aria-busy={pendingProvider === provider}
        >
          {pendingProvider === provider ? (
            <Spinner data-icon="inline-start" />
          ) : provider === "github" ? (
            <GitHubMark />
          ) : (
            <PayPalMark />
          )}
          {LABELS[provider]}
        </Button>
      ))}

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
