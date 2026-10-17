import type { JSX } from "react";
import { EventsEmptyState } from "@/features/events/components/events-empty-state";

export default function EventsPage(): JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">
          Every kitty lives inside an event. Pick one to open its workspace.
        </p>
      </div>
      <EventsEmptyState />
    </div>
  );
}
