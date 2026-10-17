"use client";

import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import type { JSX } from "react";
import { useThemeToggle } from "../hooks/use-theme-toggle";

export function ThemeToggle(): JSX.Element {
  const { isDark, isMounted, toggleTheme } = useThemeToggle();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isMounted && isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
