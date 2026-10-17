import type { JSX } from "react";
import { Cat } from "lucide-react";
import Link from "next/link";
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
} from "@kitty/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@kitty/ui/components/tooltip";
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

function NavItem({ item }: { item: AppNavItem }): JSX.Element {
  if (item.disabled) {
    return <DisabledNavItem item={item} />;
  }

  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton render={<Link href={item.href} />} isActive={item.active}>
        <Icon aria-hidden />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** App navigation; collapses to a sheet on mobile (shadcn Sidebar). */
export function AppSidebar(): JSX.Element {
  const { groups } = useAppNav();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href={routes.events} />} size="lg">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Cat aria-hidden />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">Kitty</span>
                <span className="text-xs text-muted-foreground">Agents on a leash</span>
              </span>
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
                  <NavItem key={item.title} item={item} />
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
