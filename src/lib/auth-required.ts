import "server-only";
import { GATEWAY_URL } from "./gateway";

export type AuthInfo = { login_required: boolean; idle_timeout_secs: number };

type Fetcher = () => Promise<AuthInfo>;

/** What we assume when the gateway cannot be reached. See `createAuthInfoCache`. */
const FAIL_CLOSED: AuthInfo = { login_required: true, idle_timeout_secs: 0 };

/**
 * The connected RantaiClaw gateway's auth policy, cached with a short TTL so the
 * per-request gate doesn't hit the gateway every time.
 *
 * **Fail-closed on `login_required`:** if the gateway is unreachable/errors,
 * treat login as required — a down gateway makes the console non-functional
 * anyway, so failing closed never silently drops the gate.
 *
 * **Fail-open on `idle_timeout_secs`:** an outage reports `0` (no idle
 * enforcement) rather than some guessed window, because the alternative is
 * logging every operator out on a transient gateway blip. The absolute 24h cap
 * still applies throughout, and the gate above stays on, so the exposure is a
 * session that outlives its idle window only for as long as the gateway is
 * down.
 */
export function createAuthInfoCache(fetcher: Fetcher, ttlMs: number) {
  let cached: { value: AuthInfo; at: number } | null = null;
  return {
    async get(now: number): Promise<AuthInfo> {
      if (cached) {
        // A cached `login_required: true` is safe to hold for the full TTL. A
        // cached `false` is the risky-to-be-stale direction: if the operator
        // enables login while the console is running, an ungated window opens
        // until the cache refreshes — so re-check a `false` much sooner.
        const effectiveTtl = cached.value.login_required
          ? ttlMs
          : Math.min(ttlMs, 3_000);
        if (now - cached.at < effectiveTtl) return cached.value;
      }
      try {
        const info = await fetcher();
        cached = {
          value: {
            login_required: !!info.login_required,
            idle_timeout_secs: Number(info.idle_timeout_secs) || 0,
          },
          at: now,
        };
        return cached.value;
      } catch {
        return FAIL_CLOSED;
      }
    },
  };
}

const defaultFetcher: Fetcher = async () => {
  const res = await fetch(`${GATEWAY_URL}/api/v1/auth/info`, { cache: "no-store" });
  if (!res.ok) throw new Error(`auth/info ${res.status}`);
  return (await res.json()) as AuthInfo;
};

const cache = createAuthInfoCache(defaultFetcher, 30_000);

/** True when the connected gateway requires console login. Fail-closed. */
export async function isLoginRequired(now = Date.now()): Promise<boolean> {
  return (await cache.get(now)).login_required;
}

/**
 * Idle window in milliseconds, `0` when auto-lock is disabled. Sourced from the
 * gateway so the console and the TUI run one setting rather than two copies.
 */
export async function idleTimeoutMs(now = Date.now()): Promise<number> {
  return (await cache.get(now)).idle_timeout_secs * 1000;
}
