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

  // Poll only while the tab is actually being looked at.
  //
  // The interval used to run for as long as the tab existed, so a console left
  // open in a background tab kept hitting the gateway every 15 s forever — for
  // a connection badge nobody could see. Pausing while hidden also keeps this
  // consistent with `/api/rc/status` being excluded from session activity: a
  // poll should neither prove the operator is present nor cost anything while
  // they are not.
  //
  // On becoming visible again, refresh immediately rather than waiting out a
  // full interval — the badge may be a whole hidden period stale, and an idle
  // logout that happened meanwhile should surface now.
  React.useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const sync = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      refresh();
      if (id === null) id = setInterval(refresh, pollMs);
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [refresh, pollMs]);

  return { status, connection, error, needsAuth, refresh };
}
