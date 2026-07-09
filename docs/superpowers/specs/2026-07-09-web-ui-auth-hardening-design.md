# Web UI Auth — Enable + Harden (Design B)

- **Date:** 2026-07-09
- **Status:** Approved design, pre-implementation
- **Repo:** `rantaiclaw-ui` (Next.js, `~/.rantaiclaw/ui`) — **zero changes to `rantaiclaw` (Rust)**
- **Branch:** `feat/ui-login-lockout`
- **Deployment shape:** single operator (no multi-user, no RBAC — see Non-goals)

## 1. Problem

The web UI already ships a full session-auth system (`src/lib/auth.ts`: single
password + HMAC-SHA256 HttpOnly cookie `rc_session`, 24h TTL; gate in
`src/proxy.ts`; endpoints under `src/app/api/auth/*`). Two problems make it
half-secure in practice:

1. **The gate is OFF by default.** `authEnabled()` is true only when
   `RANTAICLAW_UI_PASSWORD` is set. It is currently unset, so every request is
   accepted — while `.env.local` holds a live gateway bearer token. Anyone who
   can reach port 3939 has full agent access.
2. **No brute-force protection on `/api/auth/login`.** The Rust gateway locks
   pairing after 5 attempts / 300s (`src/security/pairing.rs`); the web login
   has no equivalent, so a weak password can be guessed without limit.

## 2. Goals

- Turn the existing gate **on** (enablement, not new auth).
- Close the brute-force hole so the web login matches the gateway's discipline
  (5 failed attempts / 300s → lockout).
- Keep the change **100% inside `rantaiclaw-ui`**, small blast radius, trivially
  reversible.

## 3. Non-goals (explicit)

- No multi-user accounts, no per-user identity, no RBAC (single operator; YAGNI).
- No changes to `rantaiclaw` (Rust): gateway bearer auth, TUI, `src/webui.rs`
  launcher all untouched. (Launcher-provisioned passwords = future "Design C".)
- No change to the session model (stays stateless HMAC, 24h TTL).
- No general per-route rate limiting beyond the login endpoint.
- No new password-hashing scheme — the shared password is compared
  constant-time as today; it is never persisted by us beyond the env var.

## 4. Current architecture (recap)

Two independent credentials, deliberately decoupled:

| Credential | Purpose | Holder |
|---|---|---|
| `RANTAICLAW_UI_PASSWORD` | Human → web UI login | Typed at `/login` |
| `RANTAICLAW_TOKEN` | Next.js → Rust gateway | Server-side only; never in browser |

Flow: browser (cookie `rc_session`) → `proxy.ts` gate → Next route
`/api/rc/[...path]` or `/api/chat` attaches `Bearer $RANTAICLAW_TOKEN` →
gateway `/api/v1/*`. The browser never talks to the gateway directly and never
sees the bearer token.

## 5. Changes

### 5.1 Enablement (env only — not committed)

Operator sets in `~/.rantaiclaw/ui/.env.local`:

```
RANTAICLAW_UI_PASSWORD=<strong password>
RANTAICLAW_UI_SECRET=<random 32+ byte hex/base64>
```

- `RANTAICLAW_UI_PASSWORD` flips `authEnabled()` to true → gate active.
- `RANTAICLAW_UI_SECRET` signs sessions independently of the password (so a
  password change is not the *only* way to invalidate sessions, and signing does
  not leak password length via the fallback path).
- `.env.example` already documents both vars → **no change to `.env.example`**.
- Secrets are **never committed** (per repo privacy rules). Ops note: keep
  `.env.local` at `chmod 0600` (it holds the bearer token + password).

### 5.2 Brute-force lockout (the only code change)

**New module `src/lib/login-guard.ts`** — a pure, testable, in-memory lockout,
built as a factory so tests get isolated instances and the route uses a
singleton:

```ts
export interface LoginGuard {
  retryAfter(key: string, now: number): number;     // secs remaining if locked, else 0
  recordFailure(key: string, now: number): number;  // secs if this failure locked it, else 0
  clearAttempts(key: string): void;
}
export function createLoginGuard(opts?: {
  maxAttempts?: number; windowMs?: number; maxKeys?: number;
}): LoginGuard;
export const loginGuard: LoginGuard; // singleton for the route
```

Defaults: `maxAttempts = 5`, `windowMs = 300_000` (matches the gateway),
`maxKeys = 1024` (bounds memory).

State: `Map<string, number[]>` — per-key timestamps of recent failures. Every
access prunes timestamps older than `windowMs` (sliding window). When map size
would exceed `maxKeys`, expired keys are evicted first.

Exact semantics (documented so it is unambiguous):

- **Attempts 1–4** (failures within window): return **401** "Incorrect password".
- **Attempt 5** (the failure that reaches `maxAttempts`): return **429**; the key
  is now locked. Further attempts within the window also return **429**.
- Lockout lifts automatically as the oldest in-window failure ages past
  `windowMs`. `recordFailure` returns `retryAfter = ceil((oldest + windowMs - now)/1000)`.
- A **successful** login calls `clearAttempts(key)` — the counter resets.
- The 429 response carries a `Retry-After` header and a generic message; it does
  **not** leak remaining-attempt counts.

**Edit `src/app/api/auth/login/route.ts`** to wire the guard in:

```
POST(req):
  if !authEnabled(): return { ok:true, authDisabled:true }   // unchanged
  key = clientKey(req); now = Date.now()
  lockedFor = loginGuard.retryAfter(key, now)
  if lockedFor > 0: return 429 (Retry-After: lockedFor)
  password = parse body
  if !checkPassword(password):
      retryAfter = loginGuard.recordFailure(key, now)
      return retryAfter>0 ? 429(Retry-After) : 401
  loginGuard.clearAttempts(key)
  token = createSessionToken(); return 200 + Set-Cookie   // unchanged
```

`clientKey(req)`: first IP of `x-forwarded-for`, else `x-real-ip`, else the
constant `"local"`. When no forwarding header exists (typical loopback), all
requests share the `"local"` bucket → a **global** lockout, which is the
conservative/safe direction. `Date.now()` is read in the route and passed into
the pure functions (keeps the module deterministic for tests).

Lockout only runs when `authEnabled()` is true (disabled auth returns early).

### 5.3 Docs

- **New `docs/auth.md`**: how to enable (env vars), what the gate protects, the
  two-credential model, lockout behavior (5/300s), and the curl verification
  steps from §7. Keep it short.

## 6. Assumptions & constraints

- The UI runs as a **single** `next start` process. The in-memory Map is
  per-process; horizontal scaling would need a shared store (out of scope,
  documented as a limitation).
- Dev mode (`next dev`, Turbopack HMR) may reset module state on hot reload —
  acceptable for a dev-time convenience; lockout still holds within a stable
  process.
- IP attribution is best-effort. Behind a trusted reverse proxy that sets
  `x-forwarded-for`, per-client lockout works; on bare loopback it degrades to a
  single global bucket (safe).

## 7. Verification / success criteria

Automated (chosen: **both** unit + e2e):

- **Vitest unit test** `src/lib/login-guard.test.ts` (add `vitest` devDep +
  `"test": "vitest run"` script). Deterministic via injected `now`:
  1. Fresh guard, 4 failures → `retryAfter` returns 0 after each.
  2. 5th failure → `recordFailure` returns `>0`; `retryAfter` now `>0`.
  3. Advancing `now` past `windowMs` → `retryAfter` back to 0 (window slides).
  4. `clearAttempts` after success → `retryAfter` 0.
  5. Distinct keys are independent.
  6. `maxKeys` eviction does not throw and drops expired keys.

- **End-to-end curl** (against a running `next start` with a password set),
  documented in `docs/auth.md`:
  1. No cookie → `GET /chat` returns redirect to `/login`; `GET /api/rc/status`
     returns 401.
  2. `POST /api/auth/login` correct password → 200 + `Set-Cookie: rc_session`.
  3. Wrong password ×4 → 401 each; ×5 → **429** with `Retry-After`; further tries
     → 429 until the window clears.
  4. `RANTAICLAW_UI_PASSWORD` unset → login returns `authDisabled:true`, gate off
     (old dev behavior unchanged).

Regression gate before commit (repo uses bun): `bun run lint`, `bun run test`,
`bun run build` (npm equivalents also work).

## 8. Rollback

- Revert the single feature commit (new `login-guard.ts` + `login/route.ts`
  edit + `docs/auth.md` + `package.json` test wiring). No schema/state migration
  to undo.
- Operationally, unsetting `RANTAICLAW_UI_PASSWORD` disables the gate instantly
  without code changes.

## 9. Files touched

| File | Change |
|---|---|
| `src/lib/login-guard.ts` | **new** — pure lockout module + singleton |
| `src/lib/login-guard.test.ts` | **new** — vitest unit tests |
| `vitest.config.ts` | **new** — vitest node env + include glob |
| `src/app/api/auth/login/route.ts` | **edit** — wire guard, `clientKey`, 429 |
| `docs/auth.md` | **new** — enable + behavior + verification |
| `package.json` / `bun.lock` | **edit** — add `vitest` devDep + `test` script |
| `.env.local` | operator-set, **not committed** |

## 10. Future (out of scope)

- **Design C:** `rantaiclaw ui` launcher generates/writes the UI password to
  `.env.local` so operators get a secure default without hand-editing env.
- Multi-user accounts + RBAC, if the deployment ever grows past one operator.
- Shared-store lockout if the UI is ever run multi-instance.
