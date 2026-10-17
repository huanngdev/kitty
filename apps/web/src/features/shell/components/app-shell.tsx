"use client";

import { SidebarInset, SidebarProvider } from "@kitty/ui/components/sidebar";
import type { JSX, ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppTopBar } from "./app-top-bar";

export interface AppShellProps {
  name: string;
  email: string;
  children: ReactNode;
}

/** Signed-in frame: sidebar + top bar + content area. */
export function AppShell({ name, email, children }: AppShellProps): JSX.Element {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppTopBar name={name} email={email} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
