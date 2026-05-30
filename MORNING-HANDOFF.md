# 🌅 Morning handoff — rantaiclaw-ui

Built overnight per your goal: a standalone **Next.js 16 + shadcn + React 19 + Tailwind v4**
web UI for RantaiClaw, modeled on the **Hermes Agent web UI** with **OpenClaw** ops-dashboard
ideas, reusing the design language/components/logo from your **RantAI-Agents** app.

**It's running and verified against a live RantaiClaw backend.** Screenshots: `.shots/chat.png`,
`.shots/ops.png` (also sent to you in chat).

---

## TL;DR — what's live right now

| Thing | URL / location | State |
|---|---|---|
| **Web UI** (dev server) | http://127.0.0.1:3939 | ✅ running (bun, pid in `.devserver.pid`) |
| **Dev gateway** (keyless, loopback) | http://127.0.0.1:3017 | ✅ running (pid in `.devgateway/dev-gateway.pid`) |
| Your real MiniMax gateway (:3000) | — | ⏹️ stopped (restored to how you left it) |

Open **http://127.0.0.1:3939** → you land on **Chat**; **Ops** is in the left rail.

The UI currently points at the **dev gateway** (`.env.local` → :3017), which has **no provider
key**, so:
- ✅ Everything reads live: status, **your real sessions** (shared `sessions.db`), insights,
  33 providers, channels, skills, memory, doctor checks, streaming plumbing.
- ⚠️ Sending a chat returns a clean "OpenRouter API key not set" error (no key on the dev gateway).
  The streaming path itself is proven working — it just needs a real provider.

---

## ▶️ Get REAL chat (MiniMax) working — one command

```bash
cd packages/rantaiclaw-ui
node scripts/setup-minimax.mjs            # registers a UI token in your active profile, writes .env.local
# then start your real gateway + the UI:
( cd ../rantaiclaw && ./target/release/rantaiclaw gateway --host 127.0.0.1 -p 3000 )
bun run dev
```

`setup-minimax.mjs` adds a bearer token to your active profile's `[gateway] paired_tokens`
(additive; `require_pairing` stays ON; backup written to `config.toml.bak-rantaiclaw-ui`) and
points `.env.local` at :3000. **I deliberately did NOT do this automatically** — it modifies your
gateway config, so it's your call. (An auto-mode guardrail also blocked me from touching it,
correctly.)

> Why a token at all: your `minimax-test` profile has `require_pairing = true`. Tokens are stored
> as SHA-256 hashes and the gateway only prints a new pairing code when *zero* tokens exist, so the
> existing one can't be reused. Registering a fresh token is the clean, additive path.

## ▶️ Reproduce the zero-config dev setup

```bash
cd packages/rantaiclaw-ui
./scripts/dev.sh          # starts dev gateway (:3017) + UI (:3939), points env at it
```

---

## What I built (feature map)

**Chat** (Hermes-style, three-panel):
- Streaming responses over SSE, Stop button, model + provider override in the composer footer.
- Sessions panel: list / filter / resume (read-only history) / inline rename. Live from `/sessions`.
- Inline **tool-call cards** (collapsible: name, args, result, ok/fail), markdown + copy-able code
  blocks, per-message token/cost, graceful error frames.

**Ops** (OpenClaw-style dashboard) — persistent metric bar + tabbed read-only panels:
- Status (runtime + doctor checks), Sessions, Usage (insights + memory), Providers, Channels,
  Skills, Memory browser, Persona.

**Architecture**: browser → Next.js server-side proxy (`/api/rc/*` JSON, `/api/chat` SSE relay) →
gateway `/api/v1/*`. The bearer token lives server-side only; no CORS, no token in the browser.
Theme tokens (OKLCH light/dark), Poppins font, and the RantAI logo were copied from RantAI-Agents.

Full design rationale + API contract: **`docs/DESIGN.md`**.

---

## Known limitations / backend follow-ups (small Rust changes)

1. **Multi-turn continuity**: `POST /api/v1/agent/chat` builds a fresh per-turn agent and persists
   each call as a *new* session — no `session_id`/history param. The UI keeps the visible thread
   client-side, but the agent doesn't yet remember earlier turns of the same on-screen thread.
   → add `session_id`/`history` to `ChatRequestBody` and replay prior messages.
2. **Resuming a session** shows its transcript read-only; sending starts a new backend session
   (same root cause as #1).
3. **Ops is read-only**. Mutating actions (config edit, cron CRUD, skill enable/disable, secrets)
   need new gateway endpoints — listed for later, not built tonight.

---

## Stop / restart / clean up

```bash
# stop everything I left running
kill $(cat packages/rantaiclaw-ui/.devserver.pid) 2>/dev/null            # UI
kill $(cat packages/rantaiclaw-ui/.devgateway/dev-gateway.pid) 2>/dev/null # dev gateway
```

`.env.local`, `.devgateway/`, `.shots/`, logs, and `*.pid` are git-ignored. The new repo is at
`packages/rantaiclaw-ui` (its own `git init`, initial commit made; **not** committed into the
rantaiclaw Rust repo, and nothing was pushed).

## Verified

- `bun run build` ✅ clean (Next 16 + Turbopack, TypeScript passes).
- `/`→307→`/chat`, `/chat` 200, `/ops` 200; `/api/rc/{status,sessions,providers}` live via proxy;
  `/api/chat` SSE relay streams frames. Browser render confirmed (screenshots).
