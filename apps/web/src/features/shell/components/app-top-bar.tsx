"use client";

import { Separator } from "@kitty/ui/components/separator";
import { SidebarTrigger } from "@kitty/ui/components/sidebar";
import type { JSX } from "react";
import { EventSwitcher } from "./event-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export interface AppTopBarProps {
  name: string;
  email: string;
}

/** Sticky top bar: sidebar trigger, event switcher, theme toggle, account menu. */
export function AppTopBar({ name, email }: AppTopBarProps): JSX.Element {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" />
      <EventSwitcher />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu name={name} email={email} />
      </div>
    </header>
  );
}
