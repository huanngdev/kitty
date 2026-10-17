import type { JSX } from "react";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { routes } from "@/lib/routes";

export const instant = false;

/** Consumes `?token=` from the reset email. */
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">): Promise<JSX.Element> {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

  return (
    <AuthShell
      title="Choose a new password"
      description="Your other devices will be signed out."
      footer={
        <p className="text-sm text-muted-foreground">
          Need a new link?{" "}
          <Link
            href={routes.forgotPassword}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Request another
          </Link>
        </p>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
