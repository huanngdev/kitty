import type { JSX } from "react";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { DemoSignInButton } from "@/features/auth/components/demo-sign-in-button";
import { SignInMethods } from "@/features/auth/components/sign-in-methods";
import { AuthDivider } from "@/features/auth/components/auth-divider";
import { readNextPath, routes } from "@/lib/routes";

export const instant = false;

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">): Promise<JSX.Element> {
  const params = await searchParams;
  const nextPath = readNextPath(params);

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to open your kitty."
      footer={
        <p className="text-sm text-muted-foreground">
          New to Kitty?{" "}
          <Link
            href={routes.signUp}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-6">
        <SignInMethods nextPath={nextPath} />
        <AuthDivider />
        <DemoSignInButton />
      </div>
    </AuthShell>
  );
}
