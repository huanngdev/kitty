"use client";

import type { JSX } from "react";
import { EventsError } from "@/features/events/components/events-error";

export default function EventsErrorBoundary({ reset }: { reset: () => void }): JSX.Element {
  return <EventsError reset={reset} />;
}
