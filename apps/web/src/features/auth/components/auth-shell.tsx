import type { JSX, ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { routes } from "@/lib/routes";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared frame for `/sign-in` and `/sign-up` (docs/23-user-screen-flow.md S02). */
export function AuthShell({ title, description, children, footer }: AuthShellProps): JSX.Element {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <Link href={routes.home} className="flex flex-col items-center gap-1">
        <Logo size="md" showWordmark />
        <span className="text-xs text-muted-foreground">Let your agents spend. On a leash.</span>
      </Link>

      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
          {footer === undefined ? null : <CardFooter>{footer}</CardFooter>}
        </Card>
      </div>
    </main>
  );
}
