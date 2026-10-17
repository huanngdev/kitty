"use client";

import type { JSX } from "react";
import { useAuthConfig } from "../hooks/use-auth-config";
import { LinkedAccountsCard } from "./linked-accounts-card";

/** Linked accounts, with the provider list from the public auth config. */
export function LinkedAccountsSection(): JSX.Element {
  const { providers } = useAuthConfig();

  return <LinkedAccountsCard availableProviders={providers} />;
}
