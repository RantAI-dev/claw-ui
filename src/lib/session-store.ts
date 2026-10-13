// Process-wide session state, shared by the proxy and the route handlers. Those
// compile into separate bundles, so a module-level value would exist once per
// bundle. A `Symbol.for` key on `globalThis` is one slot per process, and the
// registry lookup finds the same symbol from every copy of this module.
//
// Nothing here survives a restart. That is the design: a restart forgets the
// revoked set, and the start-time check refuses every cookie issued before the
// process started, so a forgotten revocation cannot bring a session back.

export type RevocationSet = {
  revoke(sid: string, exp: number, now?: number): void;
  has(sid: string, now?: number): boolean;
};

/**
 * A map of revoked session ids to the absolute expiry of each session. Once its
 * cap is reached, entries whose `exp` has passed are dropped; live entries are
 * never dropped to make room, so a revoked session cannot come back early.
 */
export function createRevocationSet(opts: { maxKeys?: number } = {}): RevocationSet {
  const maxKeys = opts.maxKeys ?? 10_000;
  const store = new Map<string, number>();

  function evictExpired(now: number): void {
    if (store.size < maxKeys) return;
    for (const [sid, exp] of store) {
      if (exp <= now) store.delete(sid);
    }
  }

  return {
    revoke(sid, exp, now = Date.now()) {
      evictExpired(now);
      store.set(sid, exp);
    },
    has(sid, now = Date.now()) {
      const exp = store.get(sid);
      if (exp === undefined) return false;
      if (exp <= now) {
        store.delete(sid);
        return false;
      }
      return true;
    },
  };
}

type SessionStore = {
  revoked: RevocationSet;
  startedAt: number;
};

const KEY = Symbol.for("rantaiclaw-ui.session-store");

type Holder = typeof globalThis & { [KEY]?: SessionStore };

function store(): SessionStore {
  const g = globalThis as Holder;
  if (!g[KEY]) {
    // The process started before any cookie it could mint, so this is at or
    // before every `iat` it will ever issue. Stamping it at first access instead
    // would refuse a login made a moment earlier in the same process.
    g[KEY] = {
      revoked: createRevocationSet(),
      startedAt: Date.now() - process.uptime() * 1000,
    };
  }
  return g[KEY];
}

/** Record that the session with this id has been signed out. */
export function revokeSession(sid: string, exp: number, now = Date.now()): void {
  store().revoked.revoke(sid, exp, now);
}

export function isSessionRevoked(sid: string, now = Date.now()): boolean {
  return store().revoked.has(sid, now);
}

/** Whether a cookie issued at `iat` predates this console process. */
export function issuedBeforeStart(iat: number): boolean {
  return iat < store().startedAt;
}
