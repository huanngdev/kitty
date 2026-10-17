import type { JSX, ReactNode } from "react";
import { Cat } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@kitty/ui/components/card";
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
      <Link href={routes.home} className="flex items-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Cat aria-hidden className="size-5" />
        </span>
        <span className="flex flex-col">
          <span className="text-lg font-semibold tracking-tight">Kitty</span>
          <span className="text-xs text-muted-foreground">Let your agents spend. On a leash.</span>
        </span>
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
