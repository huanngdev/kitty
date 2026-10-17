import type { JSX } from "react";
import { cn } from "@/lib/utils";

/** Visual sizes for the mark and the wordmark. */
export type LogoSize = "sm" | "md" | "lg";

export interface LogoProps {
  /** Mark + wordmark scale. Defaults to `"md"`. */
  size?: LogoSize;
  /** Render the "Kitty" wordmark next to the mark. Defaults to `false`. */
  showWordmark?: boolean;
  className?: string;
}

const markClasses: Record<LogoSize, string> = {
  sm: "size-5",
  md: "size-8",
  lg: "size-12",
};

const wordmarkClasses: Record<LogoSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-3xl",
};

/**
 * The Kitty brand mark: a cat head with a leash loop, drawn with `currentColor`
 * only so it follows the theme. This file is the single place the brand is
 * rendered (CODE_RULES.md §C).
 */
export function Logo({ size = "md", showWordmark = false, className }: LogoProps): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        role="img"
        aria-label="Kitty"
        className={cn("shrink-0 text-primary", markClasses[size])}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7.6 7.7 6.6 3.7l4.2 2.2" />
        <path d="M16.4 7.7 17.4 3.7l-4.2 2.2" />
        <circle cx="12" cy="12.6" r="6.3" />
        <circle cx="9.7" cy="11.9" r="0.85" fill="currentColor" stroke="none" />
        <circle cx="14.3" cy="11.9" r="0.85" fill="currentColor" stroke="none" />
        <path d="M11.4 14.2 12 14.8l.6-.6" />
        <path d="M17.1 17.3 18.2 18.4" />
        <circle cx="19.3" cy="19.5" r="2" />
      </svg>
      {showWordmark ? (
        <span className={cn("font-heading font-semibold tracking-tight", wordmarkClasses[size])}>
          Kitty
        </span>
      ) : null}
    </span>
  );
}
