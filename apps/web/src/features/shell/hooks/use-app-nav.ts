"use client";

import {
  Activity,
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  Link2,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { routes } from "@/lib/routes";

/** One sidebar entry. Disabled entries are planned screens (docs/23 §4). */
export interface AppNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  disabled: boolean;
  active: boolean;
}

export interface AppNavGroup {
  label: string;
  items: AppNavItem[];
}

export interface UseAppNavResult {
  groups: AppNavGroup[];
}

interface NavItemDefinition {
  title: string;
  href: string;
  icon: LucideIcon;
  disabled: boolean;
}

const eventNavItems: NavItemDefinition[] = [
  {
    title: "Overview",
    href: "/events/:eventId",
    icon: LayoutDashboard,
    disabled: true,
  },
  {
    title: "Plan",
    href: "/events/:eventId/plan",
    icon: CalendarRange,
    disabled: true,
  },
  {
    title: "Money",
    href: "/events/:eventId/money",
    icon: Wallet,
    disabled: true,
  },
  {
    title: "Leashes",
    href: "/events/:eventId/leashes",
    icon: Link2,
    disabled: true,
  },
  {
    title: "Approvals",
    href: "/events/:eventId/approvals",
    icon: ShieldCheck,
    disabled: true,
  },
  {
    title: "Activity",
    href: "/events/:eventId/activity",
    icon: Activity,
    disabled: true,
  },
  {
    title: "Chat",
    href: "/events/:eventId/chat",
    icon: MessagesSquare,
    disabled: true,
  },
];

/**
 * Builds the sidebar from the docs/23 sitemap. Screens that do not exist yet are
 * disabled and labelled "Coming soon" instead of 404ing.
 */
export function useAppNav(): UseAppNavResult {
  const pathname = usePathname();

  return {
    groups: [
      {
        label: "Workspace",
        items: [
          {
            title: "Events",
            href: routes.events,
            icon: CalendarDays,
            disabled: false,
            active: pathname === routes.events,
          },
        ],
      },
      {
        label: "Event",
        items: eventNavItems.map((item) => ({ ...item, active: false })),
      },
      {
        label: "Settings",
        items: [
          {
            title: "Account",
            href: routes.accountSettings,
            icon: UserRound,
            disabled: false,
            active: pathname === routes.accountSettings,
          },
          {
            title: "AI models",
            href: routes.aiSettings,
            icon: Sparkles,
            disabled: true,
            active: false,
          },
        ],
      },
    ],
  };
}
