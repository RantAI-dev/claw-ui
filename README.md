# rantaiclaw-ui

Standalone, optional **web UI** for the [RantaiClaw](https://github.com/RantAI-dev) agent
runtime. Chat with your agent and watch its operations from the browser.

Built with **Next.js 16 · React 19 · Tailwind CSS v4 · shadcn**. It is a thin client over
RantaiClaw's existing `/api/v1/*` gateway API — modeled on the Hermes Agent web UI with
OpenClaw-style ops panels.

> This is a **separate repo** from the RantaiClaw runtime. It talks to the runtime over HTTP;
> it does not embed or modify it.

## Features

- **Chat** — streaming responses (SSE), **multi-turn** conversations, session
  history with resume / full-text search / rename / delete, inline tool-call cards, syntax-highlighted
  code blocks, regenerate, model/provider switching, Stop, and a context/details side panel.
- **Ops** — live metric bar + panels, most now **interactive**:
  - status & doctor, sessions, usage, providers, memory (read-only views)
  - **Channels** — connect a Telegram bot and edit its sender allowlist
  - **Cron** — create agent jobs, enable/disable, run-now, delete
  - **Skills** — enable/disable toggles
  - **Config** — edit the default model + view full config (secrets redacted)
  - **Secrets** — set the active provider key (encrypted at rest, never echoed)
  - **Persona** — switch presets
- **Auth** — optional login gate (signed HttpOnly cookie). See [docs/auth.md](docs/auth.md) for how
  it is enabled and what `RANTAICLAW_UI_SECRET` is for.

Hardened for self-hosting: server-side proxy (token never reaches the browser), CSP + security
headers, standalone Docker image, health endpoint, graceful gateway-down handling.

## Architecture

```
Browser ─▶ Next.js route handlers (server-side proxy, holds the token) ─▶ RantaiClaw gateway /api/v1/*
```

The browser never sees the gateway token and never makes cross-origin calls — the Next.js
server proxies everything (`src/app/api/rc/*` for JSON, `src/app/api/chat` for the SSE relay).

## Quick start

```bash
# 1) Start the RantaiClaw gateway (from the rantaiclaw repo)
./target/release/rantaiclaw gateway --host 127.0.0.1 -p 3000

# 2) Configure + run the UI
cp .env.example .env.local        # set RANTAICLAW_TOKEN if the gateway requires pairing
bun install
bun run dev                       # → http://127.0.0.1:3939
```

If the gateway requires pairing, put the token from `POST /pair` into `RANTAICLAW_TOKEN` in
`.env.local`, or run `scripts/dev.sh`, which does the pairing and writes it for you.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `RANTAICLAW_GATEWAY_URL` | `http://127.0.0.1:3000` | Gateway base URL (server-side only) |
| `RANTAICLAW_TOKEN` | _(empty)_ | Bearer token from `POST /pair`; empty when `require_pairing=false` |
| `RANTAICLAW_UI_SECRET` | _(empty)_ | Cookie-signing secret. Required when login is enabled — the console refuses to serve a forgeable session without it. `rantaiclaw ui start` generates one |
| `RANTAICLAW_UI_TRUST_PROXY` | `0` | Set to `1` behind a TLS-terminating reverse proxy, so the session cookie is marked `Secure` from `X-Forwarded-Proto` |
| `RANTAICLAW_UI_ALLOWED_HOSTS` | loopback + any IP literal | Extra `Host` values the BFF answers `/api/rc/*` on. Loopback and IP-literal hosts (a LAN address, for example) are always allowed; set this only when you reach the console by a DNS name (tunnel domain, `console.lan`) |

## Remote access

Keep the gateway and UI on loopback. To reach them remotely, tunnel:

```bash
ssh -N -L 3939:127.0.0.1:3939 user@your-host
```

or use Tailscale. Do not expose either port to the public internet directly.

## Status & roadmap

See [`docs/DESIGN.md`](docs/DESIGN.md). Notable v1 limitations: multi-turn continuity and mutating
ops actions require small additions to the RantaiClaw gateway (documented there).
