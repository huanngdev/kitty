import { Card, CardContent, CardHeader } from "@kitty/ui/components/card";
import { Skeleton } from "@kitty/ui/components/skeleton";
import type { JSX } from "react";

const skeletonKeys = ["one", "two", "three"] as const;

/** S03 loading state: skeleton event cards (docs/23 §6). */
export function EventsSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {skeletonKeys.map((key) => (
        <Card key={key}>
          <CardHeader>
            <div className="grid gap-2">
              <div className="grid h-5 w-48">
                <Skeleton />
              </div>
              <div className="grid h-4 w-72 max-w-full">
                <Skeleton />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <div className="grid h-4 w-full">
                <Skeleton />
              </div>
              <div className="grid h-4 w-2/3">
                <Skeleton />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
