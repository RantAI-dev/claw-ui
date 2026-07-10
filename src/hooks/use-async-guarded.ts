"use client";

import * as React from "react";

/**
 * Like {@link useAsync}, but ignores stale in-flight responses via a request
 * token and keeps the previous data across dependency changes. Use it where the
 * dependency switch changes the *endpoint* (and response shape), e.g. the graph
 * scope toggle: a slow earlier request must not clobber a newer view.
 */
export function useAsyncGuarded<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const reqId = React.useRef(0);

  const run = React.useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await fn();
      if (id === reqId.current) setData(r);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, refresh: run };
}
