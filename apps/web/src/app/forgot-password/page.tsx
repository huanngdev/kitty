import type { JSX } from "react";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordScreen } from "@/features/auth/components/forgot-password-screen";
import { routes } from "@/lib/routes";

export const instant = false;

/** Requests a reset link (docs/23 F1: recovery path). */
export default function ForgotPasswordPage(): JSX.Element {
  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a link to choose a new one."
      footer={
        <p className="text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link
            href={routes.signIn}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordScreen showDevHint={process.env.NODE_ENV !== "production"} />
    </AuthShell>
  );
}
