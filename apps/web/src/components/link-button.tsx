import { Button } from "@/components/ui/button";
import Link, { type LinkProps } from "next/link";
import type { ComponentProps, JSX, ReactNode } from "react";

/**
 * Props for {@link LinkButton}: every `Button` prop (variant, size, …) plus the
 * Next.js `Link` navigation props. `render` and `nativeButton` are owned by
 * `LinkButton`, so callers cannot pass them by mistake.
 */
export type LinkButtonProps = Omit<
  ComponentProps<typeof Button>,
  "render" | "nativeButton" | "className"
> & {
  href: LinkProps["href"];
  prefetch?: LinkProps["prefetch"];
  target?: ComponentProps<"a">["target"];
  className?: string;
  children?: ReactNode;
};

/**
 * A `Button` that navigates with a Next.js `Link`.
 *
 * Base UI's `Button` defaults to `nativeButton`, which warns when `render`
 * swaps in a non-`<button>` — an `<a>` here — because the anchor would lose
 * native button semantics. Setting `nativeButton={false}` makes Base UI apply
 * button behaviour (activation, focus, role) on top of the link instead
 * (CODE_RULES.md §C).
 */
export function LinkButton({
  href,
  prefetch,
  target,
  className,
  children,
  ...props
}: LinkButtonProps): JSX.Element {
  return (
    <Button
      nativeButton={false}
      className={className}
      render={<Link href={href} prefetch={prefetch} target={target} />}
      {...props}
    >
      {children}
    </Button>
  );
}
