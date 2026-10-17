"use client";

import { Button } from "@kitty/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@kitty/ui/components/tooltip";
import { Boxes, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";
import { routes } from "@/lib/routes";

/**
 * Placeholder event switcher. Events are not persisted yet (KIT-21), so it
 * explains the empty state instead of opening a broken menu.
 */
export function EventSwitcher(): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Button variant="outline" size="sm" disabled aria-disabled="true">
          <Boxes data-icon="inline-start" aria-hidden />
          <span className="max-w-40 truncate">No event selected</span>
          <ChevronsUpDown data-icon="inline-end" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span>
          Create your first event to switch between events.{" "}
          <Link href={routes.newEvent} className="underline underline-offset-4">
            Create event
          </Link>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
