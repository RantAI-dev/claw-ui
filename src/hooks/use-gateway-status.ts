"use client";

import * as React from "react";
import { api } from "@/lib/api";
import type { StatusInfo } from "@/lib/types";

export type Connection = "connecting" | "online" | "offline";

export function useGatewayStatus(pollMs = 15000) {
  const [status, setStatus] = React.useState<StatusInfo | null>(null);
  const [connection, setConnection] = React.useState<Connection>("connecting");

  const refresh = React.useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setConnection("online");
    } catch {
      setConnection("offline");
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { status, connection, refresh };
}
