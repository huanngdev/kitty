"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import type { JSX } from "react";
import { useEventsError } from "../hooks/use-events-error";

export interface EventsErrorProps {
  reset: () => void;
}

/** S03 error state: message plus a retry action (docs/23 §6). */
export function EventsError({ reset }: EventsErrorProps): JSX.Element {
  const { retry } = useEventsError(reset);

  return (
    <Alert variant="destructive">
      <AlertTitle>We couldn&apos;t load your events</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col items-start gap-3">
          <span>Something went wrong on our side. Your data is safe.</span>
          <Button variant="outline" size="sm" onClick={retry}>
            <RotateCcw data-icon="inline-start" aria-hidden />
            Retry
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
