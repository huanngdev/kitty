"use client";

import { GitHubMark } from "@/components/brand/github-mark";
import { PayPalMark } from "@/components/brand/paypal-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { SocialProviderId } from "@kitty/shared/auth";
import { KeyRound } from "lucide-react";
import type { JSX } from "react";
import { useLinkedAccounts } from "../hooks/use-linked-accounts";

const PROVIDER_LABEL: Record<string, string> = {
  credential: "Email & password",
  github: "GitHub",
  paypal: "PayPal",
};

function ProviderIcon({ providerId }: { providerId: string }): JSX.Element {
  if (providerId === "github") return <GitHubMark />;
  if (providerId === "paypal") return <PayPalMark />;
  return <KeyRound aria-hidden />;
}

interface LinkedAccountsCardProps {
  /** Social providers this deployment configured, so we only offer real links. */
  availableProviders: SocialProviderId[];
}

/** Settings → Account: link/unlink GitHub and PayPal, never the last method. */
export function LinkedAccountsCard({ availableProviders }: LinkedAccountsCardProps): JSX.Element {
  const { accounts, isLoading, link, unlink, pendingProvider, canUnlink, error, message } =
    useLinkedAccounts();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in methods</CardTitle>
        <CardDescription>
          Any of these signs you in to the same account. Keep at least one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading sign-in methods…
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {accounts.map((account) => (
                <li
                  key={`${account.providerId}:${account.accountId}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <ProviderIcon providerId={account.providerId} />
                    <span className="font-medium">
                      {PROVIDER_LABEL[account.providerId] ?? account.providerId}
                    </span>
                  </span>
                  {account.providerId === "credential" ? (
                    <Badge variant="secondary">Primary</Badge>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canUnlink(account.providerId) || pendingProvider !== null}
                      onClick={() => unlink(account.providerId)}
                    >
                      {pendingProvider === account.providerId ? (
                        <Spinner data-icon="inline-start" />
                      ) : null}
                      Unlink
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {availableProviders.map((provider) => {
              const linked = accounts.some((account) => account.providerId === provider);

              if (linked) return null;

              return (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingProvider !== null}
                  onClick={() => link(provider)}
                >
                  {pendingProvider === provider ? (
                    <Spinner data-icon="inline-start" />
                  ) : provider === "github" ? (
                    <GitHubMark />
                  ) : (
                    <PayPalMark />
                  )}
                  Link {PROVIDER_LABEL[provider] ?? provider}
                </Button>
              );
            })}
          </div>

          {accounts.length <= 1 ? (
            <p className="text-xs text-muted-foreground">
              Add another sign-in method before unlinking your only one.
            </p>
          ) : null}
          {error === null ? null : (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {message === null ? null : <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
