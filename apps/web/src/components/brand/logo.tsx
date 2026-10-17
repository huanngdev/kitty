import Image from "next/image";
import type { JSX } from "react";
import { cn } from "@/lib/utils";

/** Visual sizes for the mark and the wordmark. */
export type LogoSize = "sm" | "md" | "lg";

/**
 * Which artwork to render:
 * - `"auto"` (default) renders both files and lets CSS follow the theme via the
 *   `dark` class on `<html>` — no hydration mismatch and no flash on load.
 * - `"light"` / `"dark"` render a single file, for fixed-background places.
 */
export type LogoTheme = "auto" | "light" | "dark";

export interface LogoProps {
  /** Mark + wordmark scale. Defaults to `"md"`. */
  size?: LogoSize;
  /** Render the "Kitty" wordmark next to the mark. Defaults to `false`. */
  showWordmark?: boolean;
  /** Artwork variant. Defaults to `"auto"` (follows the theme). */
  theme?: LogoTheme;
  /** Mark the mark as a priority image (preload) on landing/sign-in. */
  priority?: boolean;
  className?: string;
}

const LIGHT_SRC = "/brand/kitty-logo-light.svg";
const DARK_SRC = "/brand/kitty-logo-dark.svg";

/**
 * Intrinsic size of the artwork. The source is cropped to the exact geometric
 * bounding box of its paths (`viewBox="300 17.536248 300 282.463752"`), so the
 * aspect ratio is ~1.0621 and not square (docs/15-ui-ux.md §1).
 */
const MARK_WIDTH = 300;
const MARK_HEIGHT = 282;

/** `next/image` sizes by height; width comes from the intrinsic aspect ratio. */
const markClasses: Record<LogoSize, string> = {
  sm: "h-5",
  md: "h-8",
  lg: "h-12",
};

const wordmarkClasses: Record<LogoSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-3xl",
};

/**
 * The Kitty brand mark: the owner's cat artwork, light and dark variants. This
 * file is the single place the brand is rendered (CODE_RULES.md §C).
 */
export function Logo({
  size = "md",
  showWordmark = false,
  theme = "auto",
  priority = false,
  className,
}: LogoProps): JSX.Element {
  const imageClass = cn("w-auto shrink-0", markClasses[size]);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {theme === "dark" ? (
        <Image
          src={DARK_SRC}
          alt="Kitty"
          width={MARK_WIDTH}
          height={MARK_HEIGHT}
          unoptimized
          priority={priority}
          className={imageClass}
        />
      ) : theme === "light" ? (
        <Image
          src={LIGHT_SRC}
          alt="Kitty"
          width={MARK_WIDTH}
          height={MARK_HEIGHT}
          unoptimized
          priority={priority}
          className={imageClass}
        />
      ) : (
        // Both variants carry the same accessible name. Only one is ever in the
        // layout (`dark:hidden` / `hidden dark:block`), so `display:none` keeps
        // the other out of the accessibility tree — the logo is announced once,
        // and `img[alt="Kitty"]` is visible in both themes.
        <>
          <Image
            src={LIGHT_SRC}
            alt="Kitty"
            width={MARK_WIDTH}
            height={MARK_HEIGHT}
            unoptimized
            priority={priority}
            className={cn(imageClass, "dark:hidden")}
          />
          <Image
            src={DARK_SRC}
            alt="Kitty"
            width={MARK_WIDTH}
            height={MARK_HEIGHT}
            unoptimized
            priority={priority}
            className={cn(imageClass, "hidden dark:block")}
          />
        </>
      )}
      {showWordmark ? (
        <span className={cn("font-heading font-semibold tracking-tight", wordmarkClasses[size])}>
          Kitty
        </span>
      ) : null}
    </span>
  );
}
