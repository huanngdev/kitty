"use client";

import { Avatar, AvatarFallback } from "@kitty/ui/components/avatar";
import { Button } from "@kitty/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kitty/ui/components/dropdown-menu";
import { LogOut } from "lucide-react";
import type { JSX } from "react";
import { useUserMenu } from "../hooks/use-user-menu";

export interface UserMenuProps {
  name: string;
  email: string;
}

/** Top-bar account menu: identity and sign out. */
export function UserMenu({ name, email }: UserMenuProps): JSX.Element {
  const { initials, signOut, isSigningOut } = useUserMenu(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" aria-label="Open account menu" />}
      >
        <Avatar size="sm">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} disabled={isSigningOut}>
          <LogOut data-icon="inline-start" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
