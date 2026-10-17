import type { JSX } from "react";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { routes } from "@/lib/routes";

export default function SignUpPage(): JSX.Element {
  return (
    <AuthShell
      title="Create your account"
      description="Start a kitty for your group — offsites, trips, weddings."
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={routes.signIn}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
