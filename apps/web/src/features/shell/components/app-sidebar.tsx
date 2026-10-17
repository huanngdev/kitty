"use client";

import type { JSX } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { routes } from "@/lib/routes";
import { type AppNavItem, useAppNav } from "../hooks/use-app-nav";

function DisabledNavItem({ item }: { item: AppNavItem }): JSX.Element {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <span className="flex w-full">
            <SidebarMenuButton disabled aria-disabled="true">
              <Icon aria-hidden />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">Coming soon</TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}

interface NavItemProps {
  item: AppNavItem;
  onNavigate?: () => void;
}

function NavItem({ item, onNavigate }: NavItemProps): JSX.Element {
  if (item.disabled) {
    return <DisabledNavItem item={item} />;
  }

  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} onClick={onNavigate} />}
        isActive={item.active}
      >
        <Icon aria-hidden />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** App navigation; collapses to a sheet on mobile (shadcn Sidebar). */
export function AppSidebar(): JSX.Element {
  const { groups } = useAppNav();
  const { isMobile, setOpenMobile } = useSidebar();

  // On mobile the sidebar is a sheet over the page. Navigating must close it,
  // otherwise the destination stays behind an aria-hidden dialog.
  const closeMobileSheet = (): void => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={routes.events} onClick={closeMobileSheet} />}
              size="lg"
            >
              <Logo size="sm" showWordmark />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavItem key={item.title} item={item} onNavigate={closeMobileSheet} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <p className="px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          Let your agents spend. On a leash.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
