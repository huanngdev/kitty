import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";
import { routes } from "@/lib/routes";

/** S04 placeholder until the Planner chat ships in KIT-21. */
export default function NewEventPage(): JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create an event</h1>
        <p className="text-sm text-muted-foreground">
          Describe your event once and the Planner drafts the budget, the timeline and the payment
          gates.
        </p>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Plan an event with AI</CardTitle>
            <CardDescription>
              The Planner chat and plan review screen land in KIT-21. Until then you can explore the
              shell and the demo account.
            </CardDescription>
            <CardAction>
              <span className="flex items-center gap-2">
                <Sparkles aria-hidden className="size-4 text-primary" />
                <Badge variant="secondary">Coming soon</Badge>
              </span>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href={routes.events} />}>
              <ArrowLeft data-icon="inline-start" aria-hidden />
              Back to events
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
