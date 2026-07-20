"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { SESSION_EXPIRED } from "@/lib/activity";
import type { StatusInfo } from "@/lib/types";

export type Connection = "connecting" | "online" | "offline";

export function useGatewayStatus(pollMs = 15000) {
  const [status, setStatus] = React.useState<StatusInfo | null>(null);
  const [connection, setConnection] = React.useState<Connection>("connecting");
  const [error, setError] = React.useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setConnection("online");
      setError(null);
      setNeedsAuth(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The idle window lapsed while this tab sat open. Send the operator to
      // the login page with an explanation instead of leaving them staring at
      // an "offline" badge on a console that is actually just signed out.
      if (msg === SESSION_EXPIRED) {
        window.location.replace("/login?reason=idle");
        return;
      }
      setConnection("offline");
      setError(msg);
      setNeedsAuth(/401|unauthor|pair/i.test(msg));
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { status, connection, error, needsAuth, refresh };
}
