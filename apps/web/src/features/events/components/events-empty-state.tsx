import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CalendarDays } from "lucide-react";
import type { JSX } from "react";
import { LinkButton } from "@/components/link-button";
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
        <LinkButton href={routes.newEvent}>Create your first event</LinkButton>
      </EmptyContent>
    </Empty>
  );
}
