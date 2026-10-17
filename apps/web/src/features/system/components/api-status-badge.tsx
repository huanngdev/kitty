"use client";

import { Badge } from "@kitty/ui/components/badge";
import type { JSX } from "react";
import { useApiStatus, type ApiStatus } from "../hooks/use-api-status";

const statusLabels: Record<ApiStatus, string> = {
  loading: "Checking API…",
  online: "API online",
  offline: "API offline",
};

export function ApiStatusBadge(): JSX.Element {
  const { status } = useApiStatus();

  return (
    <Badge variant={status === "online" ? "default" : "secondary"}>{statusLabels[status]}</Badge>
  );
}
