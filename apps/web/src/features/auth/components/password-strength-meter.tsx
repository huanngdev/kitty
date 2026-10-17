import type { PasswordStrength } from "@kitty/shared/auth";
import type { JSX } from "react";
import { cn } from "@/lib/utils";

interface PasswordStrengthMeterProps {
  strength: PasswordStrength;
}

const SEGMENTS = [1, 2, 3, 4] as const;

/**
 * Four-bar strength hint under the password field. Purely advisory — the only
 * enforced rule is 8–128 characters, on both the form and the server.
 */
export function PasswordStrengthMeter({ strength }: PasswordStrengthMeterProps): JSX.Element {
  const active = (segment: number): string => {
    if (segment > strength.score) return "bg-muted";

    switch (strength.score) {
      case 0:
      case 1:
        return "bg-destructive";
      case 2:
        return "bg-primary/50";
      default:
        return "bg-primary";
    }
  };

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {SEGMENTS.map((segment) => (
          <span key={segment} className={cn("h-1 flex-1 rounded-full", active(segment))} />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-muted-foreground">{strength.label}</span>
    </div>
  );
}
