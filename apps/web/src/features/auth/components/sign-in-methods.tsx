"use client";

import type { JSX } from "react";
import { useAuthConfig } from "../hooks/use-auth-config";
import { AuthDivider } from "./auth-divider";
import { ProviderButtons } from "./provider-buttons";
import { SignInForm } from "./sign-in-form";

/**
 * Sign-in methods for `/sign-in`: social buttons first (only the configured
 * ones), then the email + password form. Kept in one client component so the
 * divider does not render when no provider is configured, and so the
 * "Forgot password?" link can follow `/api/auth-config`.
 */
export function SignInMethods({ nextPath }: { nextPath: string | null }): JSX.Element {
  const { providers, passwordReset } = useAuthConfig();

  return (
    <div className="flex flex-col gap-6">
      {providers.length === 0 ? null : (
        <>
          <ProviderButtons providers={providers} nextPath={nextPath} />
          <AuthDivider label="or continue with email" />
        </>
      )}
      <SignInForm nextPath={nextPath} passwordReset={passwordReset} />
    </div>
  );
}
