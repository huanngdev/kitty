"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { JSX, ReactNode } from "react";

/** Light/dark theme with the system default (shadcn dark-mode pattern). */
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
