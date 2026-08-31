"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { SESSION_EXPIRED } from "@/lib/activity";
import type { StatusInfo } from "@/lib/types";

export type Connection = "connecting" | "online" | "offline";

export function useGatewayStatus(pollMs = 15000) {
  const [status, setStatus] = React.useState<StatusInfo | null>(null);
  const [connection, setConnection] = React.useState<Connection>("connecting");
  const [error, setError] = React.useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = React.useState(false);
  // Require two consecutive failures before declaring the gateway offline, so a
  // single 502 or a config hot-reload does not flap the whole console to
  // "offline" while a turn is streaming fine.
  const failuresRef = React.useRef(0);
  // The two-failure debounce protects a console that WAS online from flapping
  // during a long turn. A console that has never reached the gateway has
  // nothing to protect, and "Connecting…" for 30s during an outage hid the
  // banner that says what to do.
  const everOnlineRef = React.useRef(false);

  const refresh = React.useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setConnection("online");
      setError(null);
      setNeedsAuth(false);
      failuresRef.current = 0;
      everOnlineRef.current = true;
    } catch (e) {
      // Classify by status/reason, not by a regex over the message.
      if (e instanceof ApiError) {
        const reason = (e.body as { reason?: string } | null)?.reason;
        // Idle timeout → login page with an explanation.
        if (reason === "idle") {
          window.location.replace("/login?reason=idle");
          return;
        }
        if (e.status === 401 || e.status === 403) {
          if (reason) {
            // The console session expired/absent (proxy-issued 401) — send the
            // operator to sign in, not to restart the daemon.
            window.location.replace("/login");
            return;
          }
          // A 401 straight from the gateway (no proxy `reason`) means the
          // gateway itself is unpaired — that IS the "register a token" case.
          setConnection("offline");
          setError(e.message);
          setNeedsAuth(true);
          return;
        }
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === SESSION_EXPIRED) {
        window.location.replace("/login?reason=idle");
        return;
      }
      // A genuine connectivity error: only go "offline" after two in a row.
      failuresRef.current += 1;
      setError(msg);
      setNeedsAuth(false);
      if (failuresRef.current >= 2 || !everOnlineRef.current) {
        setConnection("offline");
      }
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
