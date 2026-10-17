import type { JSX } from "react";

/**
 * PayPal brand mark for "Continue with PayPal".
 *
 * The official logo is a two-tone lockup; lucide has no PayPal icon, so this is
 * a small inline SVG that inherits `currentColor` (light + dark mode work, no
 * external asset request). CODE_RULES §C: brand marks live in their own
 * component, never inline in a page.
 */
export function PayPalMark({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-icon="inline-start"
    >
      <path d="M9.4 3h4.9c2.7 0 4.4 1.6 4 4.1-.4 2.6-2.4 4-5 4h-1.9l-.7 4.2H7.1L9.4 3Zm2.1 2.1-.7 4.1h1.6c1.4 0 2.3-.7 2.5-2 .1-1.3-.6-2.1-1.9-2.1h-1.5Z" />
      <path
        d="M11.9 7.9h3.2c2.4 0 3.8 1.4 3.4 3.8-.3 2.4-2.1 3.7-4.5 3.7h-1.3l-.5 3.2H8.9l2.3-9.6a1 1 0 0 1 .7-1.1Z"
        opacity="0.55"
      />
    </svg>
  );
}
