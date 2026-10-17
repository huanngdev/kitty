import { Separator } from "@kitty/ui/components/separator";
import type { JSX } from "react";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { DemoSignInButton } from "@/features/auth/components/demo-sign-in-button";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { readNextPath, routes } from "@/lib/routes";
import Link from "next/link";

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
        <SignInForm nextPath={nextPath} />
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Separator />
          </div>
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1">
            <Separator />
          </div>
        </div>
        <DemoSignInButton />
      </div>
    </AuthShell>
  );
}
