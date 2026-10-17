import type { JSX } from "react";
import { EventsSkeleton } from "@/features/events/components/events-skeleton";

export default function EventsLoading(): JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">Loading your events…</p>
      </div>
      <EventsSkeleton />
    </div>
  );
}
