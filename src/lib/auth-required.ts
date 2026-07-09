import "server-only";
import { GATEWAY_URL } from "./gateway";

type Fetcher = () => Promise<{ login_required: boolean }>;

/**
 * Whether the connected RantaiClaw gateway has console login enabled, cached
 * with a short TTL so the per-request auth gate doesn't hit the gateway every
 * time. **Fail-closed:** if the gateway is unreachable/errors, treat login as
 * required — a down gateway makes the console non-functional anyway, so failing
 * closed never silently drops the gate.
 */
export function createAuthRequiredCache(fetcher: Fetcher, ttlMs: number) {
  let cached: { value: boolean; at: number } | null = null;
  return {
    async isLoginRequired(now: number): Promise<boolean> {
      if (cached && now - cached.at < ttlMs) return cached.value;
      try {
        const { login_required } = await fetcher();
        cached = { value: !!login_required, at: now };
        return cached.value;
      } catch {
        return true; // fail-closed
      }
    },
  };
}

const defaultFetcher: Fetcher = async () => {
  const res = await fetch(`${GATEWAY_URL}/api/v1/auth/info`, { cache: "no-store" });
  if (!res.ok) throw new Error(`auth/info ${res.status}`);
  return (await res.json()) as { login_required: boolean };
};

const cache = createAuthRequiredCache(defaultFetcher, 30_000);

/** True when the connected gateway requires console login. Fail-closed. */
export async function isLoginRequired(now = Date.now()): Promise<boolean> {
  return cache.isLoginRequired(now);
}
