"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { format } from "date-fns";
import type { JSX } from "react";
import { useAccountSessions } from "../hooks/use-account-sessions";

/** Settings → Account: active sessions, revoke one or all others. */
export function SessionsCard(): JSX.Element {
  const {
    sessions,
    currentSessionId,
    isLoading,
    revoke,
    revokeAllOthers,
    isRevoking,
    error,
    message,
  } = useAccountSessions();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Sign out devices you no longer use.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading sessions…
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {sessions.map((session) => {
                const isCurrent = session.id === currentSessionId;

                return (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {session.userAgent ?? "Unknown device"}
                        {isCurrent ? <Badge variant="secondary">This device</Badge> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {session.ipAddress ?? "Unknown IP"} · started{" "}
                        {format(session.createdAt, "PP p")}
                      </span>
                    </span>
                    {isCurrent || session.token === undefined ? null : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isRevoking}
                        onClick={() => revoke(session.token ?? "")}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <Button type="button" variant="outline" disabled={isRevoking} onClick={revokeAllOthers}>
              {isRevoking ? <Spinner data-icon="inline-start" /> : null}
              Sign out of all other devices
            </Button>
          </div>

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
