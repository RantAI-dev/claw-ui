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

By default all clients share one global lockout counter. If the UI runs behind a
trusted reverse proxy that sets `X-Forwarded-For` / `X-Real-IP`, set
`RANTAICLAW_UI_TRUST_PROXY=1` to key the lockout per client IP instead. Do **not**
enable it for a directly-reachable server — a client could forge the header and
evade the lockout.

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
