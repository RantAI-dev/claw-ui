"use client";

import * as React from "react";

export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const loaded = React.useRef(false);
  // Request token: an older in-flight response must not overwrite a newer one.
  // The case an operator produces is hitting Refresh during a gateway restart —
  // the slow pre-restart response would land last and show pre-save data.
  const reqId = React.useRef(0);

  // Blank to the loading state only on the first load or a deps change; a manual
  // refresh keeps the stale content mounted (via `refreshing`) so the panel
  // doesn't flash and lose scroll position on every poll.
  const run = React.useCallback(async (isRefresh: boolean) => {
    const id = ++reqId.current;
    if (isRefresh && loaded.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const r = await fn();
      if (id !== reqId.current) return;
      setData(r);
      loaded.current = true;
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(() => {
    run(false);
  }, [run]);

  const refresh = React.useCallback(() => run(true), [run]);

  // `loaded` distinguishes an INITIAL-load failure (no data — the error state is
  // right) from a REFRESH failure (data is already on screen — keep it). Without
  // it, `PanelFrame` blanked the whole panel whenever a refresh failed, so the
  // most likely outcome of a *successful* save was an error screen.
  return { data, error, loading, refreshing, loaded: loaded.current, refresh };
}
