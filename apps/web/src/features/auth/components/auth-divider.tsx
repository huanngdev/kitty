import { Separator } from "@/components/ui/separator";
import type { JSX } from "react";

/** "or" rule between social sign-in and the email form. */
export function AuthDivider({ label = "or" }: { label?: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <Separator />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex-1">
        <Separator />
      </div>
    </div>
  );
}
