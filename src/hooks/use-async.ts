"use client";

import * as React from "react";

export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const loaded = React.useRef(false);

  // Blank to the loading state only on the first load or a deps change; a manual
  // refresh keeps the stale content mounted (via `refreshing`) so the panel
  // doesn't flash and lose scroll position on every poll.
  const run = React.useCallback(async (isRefresh: boolean) => {
    if (isRefresh && loaded.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await fn());
      loaded.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(() => {
    run(false);
  }, [run]);

  const refresh = React.useCallback(() => run(true), [run]);

  return { data, error, loading, refreshing, refresh };
}
