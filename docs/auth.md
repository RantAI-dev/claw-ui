# Web UI Authentication

The web UI has an optional login gate. **RantaiClaw is the single source of
truth** — the credential lives in the gateway (`config.gateway.login`), not in
the UI. The UI *follows* the connected gateway: if console login is enabled
there, the web console requires it too; if not, the UI is open.

The gate protects the UI at the Next.js edge; the gateway bearer token
(`RANTAICLAW_TOKEN`) stays server-side and never reaches the browser (BFF).

## Enable the gate

Enable it on the RantaiClaw side — not here:

```
rantaiclaw setup login      # sets a username + argon2 password hash in config.gateway.login
```

The web UI detects this via the gateway's `GET /api/v1/auth/info`
(`{ login_required, idle_timeout_secs }`), cached ~30 s and **fail-closed** on
`login_required` (if the gateway is unreachable it assumes login is required — a
down gateway makes the console non-functional anyway, so the gate is never
silently dropped). `idle_timeout_secs` fails *open* (reported as `0`) during an
outage, because logging every operator out on a transient blip is the worse
failure — the gate above stays on and the absolute cap still applies.

## Idle auto-lock

Set on the RantaiClaw side via `rantaiclaw setup login`
(`config.gateway.login.idle_timeout_secs`, `0` = off, which is the default). The
console reads it from the gateway rather than carrying its own copy, so it and
the TUI always run the same policy.

The `rc_session` payload carries two stamps: `exp`, the absolute cap, minted at
login and **never** extended; and `la`, the last-activity stamp, which slides
forward. Staying busy therefore cannot keep a session alive past 24 h.

What counts as activity is decided **server-side** in `src/lib/activity.ts`, not
by a header the client sets about itself. The console polls `/api/rc/status`
every 15 s for its connection badge and never stops while a tab is open, so that
one path is excluded — otherwise an abandoned browser would renew its own
session forever and the window could never elapse. Everything else counts, which
is the safe direction to be wrong in: a background poller nobody excludes merely
delays a logout, while a mislabelled real interaction would sign out an operator
mid-task.

Re-signing is throttled (at most once a minute, and never coarser than a quarter
of the window) so ordinary browsing doesn't put a `Set-Cookie` on every request.

When the window lapses, `src/proxy.ts` clears the cookie and either redirects to
`/login?reason=idle` (navigations) or returns `401 {"error":"session_expired",
"reason":"idle"}` (API calls). The status poll picks that up and sends the tab to
the login page, so an operator gets an explanation instead of a console that
merely looks offline.

Note the one accepted rough edge: idleness is measured from *requests*, and
watching a long stream generates none of its own. A single turn that outlasts the
window will end in a re-login — which is why the shortest offered preset is 15
minutes.

## Credentials (do not confuse them)

| Env var | Purpose | Seen by browser? |
|---|---|---|
| `RANTAICLAW_UI_SECRET` | Signs the `rc_session` cookie | No |
| `RANTAICLAW_TOKEN`     | Next.js → gateway bearer auth | No (server-side only) |

The **login credential** (username + password) is not an env var — it lives in
RantaiClaw's `config.gateway.login` and is verified server-side against the
gateway's verify-only `POST /login`. Set `RANTAICLAW_UI_SECRET` to a long random
string in production (`openssl rand -hex 32`); rotating it invalidates sessions.

## Login flow

1. Browser posts `{ username, password }` to the UI's `POST /api/auth/login`.
2. The UI (server-side) calls the gateway `POST /login` to verify — no token is
   returned to the browser.
3. On success the UI mints a signed `rc_session` HttpOnly cookie (24 h TTL).

## Brute-force lockout

Two layers: the UI's own limiter (`src/lib/login-guard.ts`, 5 failures / 300 s,
keyed per client when `RANTAICLAW_UI_TRUST_PROXY=1`) and the gateway's `/login`
lockout (a coarse backstop — it sees the UI server's IP for web logins, but still
protects direct `/login` callers). The 5th UI failure returns **HTTP 429** with
`Retry-After`; a successful login resets the counter. UI state is in-memory,
per-process.

## Limitations

- Single operator (single username + password). No per-user accounts or roles.
- `rc_session` is a stateless HMAC token (24 h cap); revoke early only by
  rotating `RANTAICLAW_UI_SECRET`.
- Idle auto-lock defends an **unattended browser**, not a stolen cookie. Someone
  holding a copied cookie renews it the same way a real operator does, simply by
  making requests, so it stays good up to the absolute cap. Rotating the secret
  is still the only way to cut a session short.
- UI lockout is per-process; a multi-instance UI would need a shared store.
