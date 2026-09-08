"use client";

import * as React from "react";
import { describeApiError } from "@/lib/api";

export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  // Two views of the same fact, on purpose. `run` needs to read it imperatively
  // without becoming a new callback every time it changes; the returned value
  // has to be state, because reading `ref.current` during render is exactly the
  // unsound pattern that survives only while it happens to be paired with a
  // `setState` on the same line — change the order once and consumers render
  // stale. They are written together and never separately.
  const loadedRef = React.useRef(false);
  const [loaded, setLoaded] = React.useState(false);
  // Request token: an older in-flight response must not overwrite a newer one.
  // The case an operator produces is hitting Refresh during a gateway restart —
  // the slow pre-restart response would land last and show pre-save data.
  const reqId = React.useRef(0);

  // Blank to the loading state only on the first load or a deps change; a manual
  // refresh keeps the stale content mounted (via `refreshing`) so the panel
  // doesn't flash and lose scroll position on every poll.
  const run = React.useCallback(async (isRefresh: boolean) => {
    const id = ++reqId.current;
    if (isRefresh && loadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const r = await fn();
      if (id !== reqId.current) return;
      setData(r);
      loadedRef.current = true;
      setLoaded(true);
    } catch (e) {
      if (id !== reqId.current) return;
      // Map through describeApiError so a load/refresh failure inherits the
      // 401 "sign in again" / 502 "gateway restarting" wording instead of a
      // bare message. PanelFrame renders this string.
      setError(describeApiError(e));
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // `deps` is this hook's own parameter — the caller decides what invalidates
    // its fetch — so it cannot be an array literal here, which is what both
    // rules below want. That is the hook's contract, not an oversight.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo -- deps are the caller's; a literal would defeat the hook
  }, deps);

  React.useEffect(() => {
    run(false);
  }, [run]);

  const refresh = React.useCallback(() => run(true), [run]);

  // `loaded` distinguishes an INITIAL-load failure (no data — the error state is
  // right) from a REFRESH failure (data is already on screen — keep it). Without
  // it, `PanelFrame` blanked the whole panel whenever a refresh failed, so the
  // most likely outcome of a *successful* save was an error screen.
  return { data, error, loading, refreshing, loaded, refresh };
}
