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
(`{ login_required }`), cached ~30 s and **fail-closed** (if the gateway is
unreachable it assumes login is required — a down gateway makes the console
non-functional anyway, so the gate is never silently dropped).

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
- `rc_session` is a stateless HMAC token (24 h TTL); revoke early only by
  rotating `RANTAICLAW_UI_SECRET`.
- UI lockout is per-process; a multi-instance UI would need a shared store.
