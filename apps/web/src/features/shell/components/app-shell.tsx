"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { JSX, ReactNode } from "react";
import { UnverifiedEmailBanner } from "@/features/auth/components/unverified-email-banner";
import { AppSidebar } from "./app-sidebar";
import { AppTopBar } from "./app-top-bar";

export interface AppShellProps {
  name: string;
  email: string;
  emailVerified: boolean;
  children: ReactNode;
}

/** Signed-in frame: sidebar + top bar + content area. */
export function AppShell({ name, email, emailVerified, children }: AppShellProps): JSX.Element {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppTopBar name={name} email={email} />
        {emailVerified ? null : (
          <div className="px-4 pt-4 md:px-6">
            <UnverifiedEmailBanner email={email} />
          </div>
        )}
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
