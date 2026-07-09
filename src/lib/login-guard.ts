// In-memory brute-force lockout for the login endpoint. Single-process only
// (the UI runs as one `next start`); state resets on restart. Mirrors the Rust
// gateway's discipline: maxAttempts failures within windowMs -> locked.

export interface LoginGuard {
  /** Seconds remaining until this key unlocks, or 0 if it is not locked. */
  retryAfter(key: string, now: number): number;
  /** Record a failed attempt; returns seconds if this failure locked it, else 0. */
  recordFailure(key: string, now: number): number;
  /** Reset a key's counter (call on successful login). */
  clearAttempts(key: string): void;
}

interface GuardOptions {
  maxAttempts?: number;
  windowMs?: number;
  maxKeys?: number;
}

export function createLoginGuard(opts: GuardOptions = {}): LoginGuard {
  const maxAttempts = opts.maxAttempts ?? 5;
  const windowMs = opts.windowMs ?? 300_000;
  const maxKeys = opts.maxKeys ?? 1024;
  const store = new Map<string, number[]>();

  // Return this key's failure timestamps within the window, pruning old ones.
  function recent(key: string, now: number): number[] {
    const cutoff = now - windowMs;
    const pruned = (store.get(key) ?? []).filter((t) => t > cutoff);
    if (pruned.length) store.set(key, pruned);
    else store.delete(key);
    return pruned;
  }

  // When the map is full, drop keys whose failures have all aged out.
  function evictExpired(now: number): void {
    if (store.size < maxKeys) return;
    const cutoff = now - windowMs;
    for (const [k, list] of store) {
      if (!list.some((t) => t > cutoff)) store.delete(k);
    }
  }

  function lockSeconds(list: number[], now: number): number {
    if (list.length < maxAttempts) return 0;
    return Math.ceil((list[0] + windowMs - now) / 1000);
  }

  return {
    retryAfter(key, now) {
      return lockSeconds(recent(key, now), now);
    },
    recordFailure(key, now) {
      evictExpired(now);
      const list = recent(key, now);
      list.push(now);
      store.set(key, list);
      return lockSeconds(list, now);
    },
    clearAttempts(key) {
      store.delete(key);
    },
  };
}

export const loginGuard: LoginGuard = createLoginGuard();
