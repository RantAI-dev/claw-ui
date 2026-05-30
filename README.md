# rantaiclaw-ui

Standalone, optional **web UI** for the [RantaiClaw](https://github.com/RantAI-dev) agent
runtime. Chat with your agent and watch its operations from the browser.

Built with **Next.js 16 · React 19 · Tailwind CSS v4 · shadcn**. It is a thin client over
RantaiClaw's existing `/api/v1/*` gateway API — modeled on the Hermes Agent web UI with
OpenClaw-style ops panels.

> This is a **separate repo** from the RantaiClaw runtime. It talks to the runtime over HTTP;
> it does not embed or modify it.

## Features

- **Chat** — streaming responses (SSE), session history, resume/search/rename, inline tool-call
  cards, model/provider switching, Stop button.
- **Ops** — read-only dashboard: status & health, sessions, usage insights, providers, channels,
  skills, memory browser, personality preset.

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

If the gateway requires pairing, run `bun run pair` (reads the pairing code you paste in, calls
`POST /pair`, writes the token into `.env.local`), or use `scripts/dev.sh` to do it all.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `RANTAICLAW_GATEWAY_URL` | `http://127.0.0.1:3000` | Gateway base URL (server-side only) |
| `RANTAICLAW_TOKEN` | _(empty)_ | Bearer token from `POST /pair`; empty when `require_pairing=false` |

## Remote access

Keep the gateway and UI on loopback. To reach them remotely, tunnel:

```bash
ssh -N -L 3939:127.0.0.1:3939 user@your-host
```

or use Tailscale. Do not expose either port to the public internet directly.

## Status & roadmap

See [`docs/DESIGN.md`](docs/DESIGN.md). Notable v1 limitations: multi-turn continuity and mutating
ops actions require small additions to the RantaiClaw gateway (documented there).
