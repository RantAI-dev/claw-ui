# Web UI Login Lockout (Design B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the existing web UI password gate and add brute-force lockout (5 failures / 300s) to `/api/auth/login`, entirely within the `rantaiclaw-ui` Next.js repo.

**Architecture:** A pure, in-memory sliding-window lockout module (`login-guard.ts`, built as a factory + singleton) is unit-tested with vitest, then wired into the existing login route so repeated wrong passwords from one client return HTTP 429 with `Retry-After`. No changes to the Rust `rantaiclaw` repo; the session/cookie model is unchanged.

**Tech Stack:** Next.js 16 (App Router, Node runtime route handlers), TypeScript 5.7, Web Crypto session auth (already present), vitest (new dev dependency), bun package manager.

## Global Constraints

- Scope is **100% inside `rantaiclaw-ui`** (`~/.rantaiclaw/ui`) — **zero changes to the Rust `rantaiclaw` repo** (no gateway/TUI/`src/webui.rs` edits).
- Single operator: **no multi-user, no RBAC, no change to the session model** (stays stateless HMAC, 24h TTL).
- Lockout parameters, copied verbatim: **`maxAttempts = 5`**, **`windowMs = 300_000`**, **`maxKeys = 1024`** (matches the Rust gateway `PairingGuard`).
- Lockout semantics: failures **1–4 → HTTP 401**; the **5th failure → HTTP 429** (locked); further attempts within the window → **429**; lockout lifts automatically as the oldest in-window failure ages past `windowMs`; a **successful login resets** the counter; 429 carries `Retry-After` and a generic message (no remaining-attempt leak).
- Guard runs **only when `authEnabled()` is true** (auth disabled returns early, unchanged dev behavior).
- Package manager is **bun**; work is on branch **`feat/ui-login-lockout`** (already created off `main`).
- **Do not touch** the repo's pre-existing uncommitted changes (`bun.lock` drift, untracked `.run`) except where `bun add -d vitest` legitimately updates `bun.lock` — before staging `bun.lock`, run `git diff bun.lock` and confirm the diff is only the vitest addition.
- Commit style: **atomic, bullet-point body, no `Co-authored-by` trailer, no AI-attribution residue** (per operator preference).
- Secrets (`RANTAICLAW_UI_PASSWORD`, `RANTAICLAW_UI_SECRET`) are **never committed** — they live only in `.env.local`.

---

### Task 1: `login-guard` module + vitest

**Files:**
- Create: `src/lib/login-guard.ts`
- Create: `src/lib/login-guard.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add `vitest` devDep + `test` script), `bun.lock` (via `bun add`)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `createLoginGuard(opts?: { maxAttempts?: number; windowMs?: number; maxKeys?: number }): LoginGuard`
  - `loginGuard: LoginGuard` (singleton, default options)
  - `interface LoginGuard { retryAfter(key: string, now: number): number; recordFailure(key: string, now: number): number; clearAttempts(key: string): void }`
  - `retryAfter` / `recordFailure` return **seconds** (0 = not locked).

- [ ] **Step 1: Add vitest dev dependency, test script, and config**

Run:
```bash
cd ~/.rantaiclaw/ui
bun add -d vitest
```

Then add the `test` script to `package.json` (leave every other line untouched):
```json
  "scripts": {
    "dev": "next dev -p 3939",
    "build": "next build",
    "start": "next start -p 3939",
    "lint": "next lint",
    "test": "vitest run",
    "dev:full": "./scripts/dev.sh",
    "setup:minimax": "node scripts/setup-minimax.mjs"
  },
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/login-guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createLoginGuard } from "./login-guard";

const OPTS = { maxAttempts: 5, windowMs: 300_000 };
const T = 1_000_000; // fixed base "now" (ms) — deterministic, no Date.now()

describe("login-guard", () => {
  it("stays unlocked for failures below the limit", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 4; i++) {
      expect(g.recordFailure("ip", T + i)).toBe(0);
      expect(g.retryAfter("ip", T + i)).toBe(0);
    }
  });

  it("locks on the 5th failure and reports retry-after seconds", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 4; i++) g.recordFailure("ip", T);
    const retry = g.recordFailure("ip", T); // 5th
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(300);
    expect(g.retryAfter("ip", T)).toBeGreaterThan(0);
  });

  it("unlocks after the window slides past the oldest failure", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 5; i++) g.recordFailure("ip", T);
    expect(g.retryAfter("ip", T)).toBeGreaterThan(0);
    expect(g.retryAfter("ip", T + 300_001)).toBe(0);
  });

  it("resets the counter on a successful login", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 5; i++) g.recordFailure("ip", T);
    expect(g.retryAfter("ip", T)).toBeGreaterThan(0);
    g.clearAttempts("ip");
    expect(g.retryAfter("ip", T)).toBe(0);
  });

  it("tracks keys independently", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 5; i++) g.recordFailure("a", T);
    expect(g.retryAfter("a", T)).toBeGreaterThan(0);
    expect(g.retryAfter("b", T)).toBe(0);
  });

  it("evicts expired keys without throwing when maxKeys is exceeded", () => {
    const g = createLoginGuard({ maxAttempts: 5, windowMs: 1_000, maxKeys: 2 });
    g.recordFailure("old1", 0);
    g.recordFailure("old2", 0);
    expect(() => g.recordFailure("new", 10_000)).not.toThrow();
    expect(g.retryAfter("old1", 10_000)).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test`
Expected: FAIL — vitest cannot resolve `./login-guard` (module does not exist yet).

- [ ] **Step 4: Write the minimal implementation**

Create `src/lib/login-guard.ts`:
```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: Verify lint and type-check are clean**

Run: `bun run lint`
Expected: no errors for the new files.

- [ ] **Step 7: Commit**

First confirm `bun.lock` only gained vitest:
```bash
git diff bun.lock | head -40   # sanity-check: only vitest-related entries
```
Then:
```bash
git add src/lib/login-guard.ts src/lib/login-guard.test.ts vitest.config.ts package.json bun.lock
git commit -F - <<'EOF'
feat(auth): add in-memory login lockout guard

- sliding-window guard: 5 failures / 300s per client key (matches gateway)
- pure factory + singleton; retryAfter/recordFailure/clearAttempts
- bounded by maxKeys with expired-key eviction
- vitest unit tests cover lock, window slide, reset, isolation, eviction
EOF
```

---

### Task 2: Wire the guard into the login route

**Files:**
- Modify: `src/app/api/auth/login/route.ts`

**Interfaces:**
- Consumes: `loginGuard` from `@/lib/login-guard` (`retryAfter`, `recordFailure`, `clearAttempts`); existing `authEnabled`, `checkPassword`, `createSessionToken`, `sessionCookie` from `@/lib/auth`.
- Produces: unchanged response contract on success (200 + `Set-Cookie: rc_session`); adds 429 + `Retry-After` on lockout.

- [ ] **Step 1: (Red) Demonstrate the missing lockout end-to-end**

Start the dev server with a throwaway password (a real secret is not needed for this test; do not commit it):
```bash
cd ~/.rantaiclaw/ui
RANTAICLAW_UI_PASSWORD=test-pw-123 RANTAICLAW_UI_SECRET=test-secret bun run dev
```
In a second terminal, send 6 wrong passwords:
```bash
BASE=http://127.0.0.1:3939
for i in 1 2 3 4 5 6; do
  printf "attempt %s -> " "$i"
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/auth/login" \
    -H 'content-type: application/json' -d '{"password":"wrong"}'
done
```
Expected (current code): `401 401 401 401 401 401` — no lockout. This is the gap. Stop the server (Ctrl-C).

- [ ] **Step 2: Edit the route to enforce the lockout**

Replace the contents of `src/app/api/auth/login/route.ts` with:
```ts
import { NextRequest } from "next/server";
import { authEnabled, checkPassword, createSessionToken, sessionCookie } from "@/lib/auth";
import { loginGuard } from "@/lib/login-guard";

export const runtime = "nodejs";

// Best-effort client identity: first XFF hop, then X-Real-IP, else a shared
// "local" bucket (loopback). Absent forwarding headers => one global bucket,
// which is the conservative direction.
function clientKey(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

function lockedResponse(retryAfterSecs: number): Response {
  return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfterSecs),
    },
  });
}

export async function POST(req: NextRequest) {
  if (!authEnabled()) return Response.json({ ok: true, authDisabled: true });

  const key = clientKey(req);
  const now = Date.now();

  const lockedFor = loginGuard.retryAfter(key, now);
  if (lockedFor > 0) return lockedResponse(lockedFor);

  let password = "";
  try {
    password = (await req.json())?.password ?? "";
  } catch {
    /* ignore malformed body */
  }

  if (!checkPassword(password)) {
    const retry = loginGuard.recordFailure(key, now);
    if (retry > 0) return lockedResponse(retry);
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }

  loginGuard.clearAttempts(key);
  const token = await createSessionToken();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": sessionCookie(token) },
  });
}
```

- [ ] **Step 3: (Green) Verify lockout end-to-end**

Restart the server with the throwaway password:
```bash
RANTAICLAW_UI_PASSWORD=test-pw-123 RANTAICLAW_UI_SECRET=test-secret bun run dev
```
Re-run the 6-attempt loop from Step 1.
Expected: `401 401 401 401 429 429` — the 5th wrong password trips the lockout.

Confirm a **correct** password while locked is still refused:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d '{"password":"test-pw-123"}'
```
Expected: `429` (the pre-check blocks before the password is checked).

Confirm the `Retry-After` header is present:
```bash
curl -si -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d '{"password":"wrong"}' | grep -i 'HTTP/\|retry-after'
```
Expected: `HTTP/1.1 429 ...` and `retry-after: <n>`.

- [ ] **Step 4: Verify the happy path and disabled-auth path**

Restart the server (clears the in-memory lock), then a correct password logs in:
```bash
curl -si -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d '{"password":"test-pw-123"}' | grep -i 'HTTP/\|set-cookie'
```
Expected: `HTTP/1.1 200 ...` and `set-cookie: rc_session=...`.

Then verify the gate stays off when no password is configured (unchanged dev behavior):
```bash
# stop server, restart WITHOUT the password env
bun run dev
curl -s -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d '{"password":"anything"}'
```
Expected: `{"ok":true,"authDisabled":true}`. Stop the server.

- [ ] **Step 5: Verify lint, tests, and production build**

Run:
```bash
bun run lint
bun run test
bun run build
```
Expected: all succeed (lint clean, 6 tests pass, build completes).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/login/route.ts
git commit -F - <<'EOF'
feat(auth): enforce login lockout on the auth endpoint

- 5 wrong passwords / 300s per client key -> HTTP 429 + Retry-After
- pre-check blocks even a correct password while locked
- successful login clears the counter
- clientKey uses X-Forwarded-For / X-Real-IP, else a shared local bucket
EOF
```

---

### Task 3: Document enablement + behavior

**Files:**
- Create: `docs/auth.md`

**Interfaces:**
- Consumes: nothing (documentation).
- Produces: operator-facing docs for enabling the gate and verifying lockout.

- [ ] **Step 1: Write `docs/auth.md`**

Create `docs/auth.md`:
```markdown
# Web UI Authentication

The web UI has an optional password gate. It is **off by default** and turns on
the moment a password is configured. It protects the UI at the Next.js edge; the
gateway bearer token is a separate, server-side-only credential.

## Two credentials (do not confuse them)

| Env var | Purpose | Seen by browser? |
|---|---|---|
| `RANTAICLAW_UI_PASSWORD` | Human login to the web UI | No (typed at `/login`) |
| `RANTAICLAW_UI_SECRET`   | Signs the `rc_session` cookie | No |
| `RANTAICLAW_TOKEN`       | Next.js → gateway bearer auth | No (server-side only) |

## Enable the gate

Set these in `~/.rantaiclaw/ui/.env.local` (never commit them):

```
RANTAICLAW_UI_PASSWORD=<a strong password>
RANTAICLAW_UI_SECRET=<a long random string, e.g. `openssl rand -hex 32`>
```

- Setting `RANTAICLAW_UI_PASSWORD` enables the gate (`authEnabled()` becomes true).
- `RANTAICLAW_UI_SECRET` signs sessions independently of the password. If unset,
  the password is used as the signing secret (changing the password then also
  invalidates existing sessions).
- Keep `.env.local` at mode `0600` — it also holds the gateway bearer token.

When no password is set, the gate is disabled (convenient for loopback-only dev)
and every request is accepted.

## Brute-force lockout

`POST /api/auth/login` allows **5 failed attempts per 300 seconds per client**.
The 5th failure returns **HTTP 429** with a `Retry-After` header; further
attempts stay 429 until the window clears. A successful login resets the counter.
State is in-memory and per-process (it resets on restart, and applies per single
`next start` instance).

## Verify

With the server running and a password set (use a throwaway value for testing):

```bash
BASE=http://127.0.0.1:3939
# Wrong password x6 -> 401 x4 then 429
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/auth/login" \
    -H 'content-type: application/json' -d '{"password":"wrong"}'
done
# Correct password (after restart to clear the lock) -> 200 + Set-Cookie
curl -si -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d '{"password":"<your password>"}' | grep -i 'HTTP/\|set-cookie'
```

## Limitations

- Single shared password (single operator). No per-user accounts or roles.
- Sessions are stateless HMAC tokens (24h TTL); they cannot be revoked
  server-side before expiry other than by rotating `RANTAICLAW_UI_SECRET`.
- Lockout is per-process; running the UI multi-instance would need a shared store.
```

- [ ] **Step 2: Verify the doc renders and links are sane**

Run: `git diff --stat docs/auth.md` and read the file once.
Expected: file present, no broken relative links (there are none).

- [ ] **Step 3: Commit**

```bash
git add docs/auth.md
git commit -F - <<'EOF'
docs(auth): document web UI gate enablement and login lockout

- two-credential model (UI password / session secret / gateway token)
- how to enable via .env.local and verify with curl
- lockout behavior and single-operator limitations
EOF
```

---

## Self-Review

**1. Spec coverage:**
- Spec §5.1 enablement → Task 3 docs (`docs/auth.md`) documents the env vars; no code change (spec says `.env.example` untouched). ✔
- Spec §5.2 guard module + semantics → Task 1 (module + tests). ✔
- Spec §5.2 route wiring (clientKey, 429, Retry-After, clear on success) → Task 2. ✔
- Spec §5.3 docs → Task 3. ✔
- Spec §7 verification (vitest unit + curl e2e; lint/test/build gate) → Task 1 Step 5, Task 2 Steps 3–5. ✔
- Spec §6 assumptions (single process, best-effort IP) → encoded in `clientKey` + docs Limitations. ✔
- Spec §8 rollback → three small commits, each revertable; unset password disables at runtime. ✔

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows complete code. ✔

**3. Type consistency:** `LoginGuard` methods `retryAfter` / `recordFailure` / `clearAttempts` are used identically in Task 1 (definition + tests) and Task 2 (route). `loginGuard` singleton name matches. `clientKey` / `lockedResponse` are self-contained in the route. ✔
