import { Button } from "@kitty/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@kitty/ui/components/empty";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";
import { routes } from "@/lib/routes";

/** S03 empty state (docs/23-user-screen-flow.md §6). */
export function EventsEmptyState(): JSX.Element {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarDays aria-hidden />
        </EmptyMedia>
        <EmptyTitle>No events yet</EmptyTitle>
        <EmptyDescription>
          An event holds the kitty, the plan and every leash your agents can spend from.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button render={<Link href={routes.newEvent} />}>Create your first event</Button>
      </EmptyContent>
    </Empty>
  );
}
