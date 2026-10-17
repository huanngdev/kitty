import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link2, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { Logo } from "@/components/brand/logo";
import { DemoSignInButton } from "@/features/auth/components/demo-sign-in-button";
import { ApiStatusBadge } from "@/features/system/components/api-status-badge";
import { routes } from "@/lib/routes";
import { getServerSession } from "@/lib/server-session";

const steps = [
  {
    icon: Wallet,
    title: "Fund the kitty",
    description: "Collect from members with PayPal invoices, one share each.",
  },
  {
    icon: Link2,
    title: "Grant leashes",
    description: "Give each agent a pass with limits, payees and an expiry.",
  },
  {
    icon: ShieldCheck,
    title: "Watch every decision",
    description: "ALLOW, step-up or deny — with a reason you can read.",
  },
] as const;

/** S01 Landing. Signed-in visitors go straight to their events. */
export const instant = false;

export default async function Home(): Promise<JSX.Element> {
  const session = await getServerSession();

  if (session !== null) {
    redirect(routes.events);
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-12 p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <ApiStatusBadge />
        <h1 className="flex justify-center">
          <Logo size="lg" showWordmark className="flex-col gap-3" />
        </h1>
        <p className="max-w-md text-lg text-balance text-muted-foreground">
          Let your agents spend. On a leash.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {steps.map((step) => (
          <Card key={step.title}>
            <CardHeader>
              <step.icon aria-hidden className="size-5 text-primary" />
              <CardTitle>{step.title}</CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Start your kitty</CardTitle>
            <CardDescription>
              Sign in, or try the demo organizer account with a workspace already set up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <Button render={<Link href={routes.signIn} />}>Sign in</Button>
              <Button variant="outline" render={<Link href={routes.signUp} />}>
                Create an account
              </Button>
              <DemoSignInButton />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
