# rantaiclaw-ui — Design & Architecture

> Standalone, optional web UI for the [RantaiClaw](../../rantaiclaw) Rust agent runtime.
> Modeled on the **Hermes Agent web UI** (chat-first, three-panel) with **OpenClaw** ops-dashboard ideas folded in.
> **Separate repo** — not committed to the rantaiclaw Rust repo.

Date: 2026-05-30 · Author: autonomous overnight build (Claude)

---

## 1. Goal

A self-hostable web UI that talks to a running RantaiClaw gateway over its existing
`/api/v1/*` HTTP API. Two top-level modes:

- **Chat** (default) — streaming conversation with the agent, session history, tool-call cards.
- **Ops** — read-only operations dashboard: status, sessions, usage, providers, channels, skills, memory, personality.

Optional to install; ships independently of the runtime.

## 2. Why "Hermes-style + OpenClaw notes", not "OpenClaw `/web`"

The user's hard constraints — **separate repo** + **optional install** — match the standalone
Hermes-WebUI pattern (a frontend that consumes the agent's HTTP API), not OpenClaw's
in-monorepo `/web`. Research summary:

| | Hermes web UIs | OpenClaw dashboards |
|---|---|---|
| Repo | standalone (`nesquena/hermes-webui`) + bundled | bundled Control UI + standalone community dashboards |
| Transport | REST + **SSE** streaming | HTTP + WebSocket |
| Strength | **chat UX** (3-panel, streaming, tool cards, sessions) | **ops UX** (status cards, cost/usage, cron, memory browser, metrics bar) |

We take the chat UX from Hermes and the ops panels from OpenClaw. Both modes share one
gateway connection, status indicator, and theme.

## 3. Stack

Mirrors the sibling `RantAI-Agents` app so components/icons/theme are reusable:

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/postcss`, `@import "tailwindcss"`, `@theme inline`)
- **shadcn** conventions (new-york / neutral, CSS variables) — minimal hand-written primitives, no Radix dep for v1
- **next-themes** (theme forced per brand via `forcedTheme`; no user toggle - this is an operator console, dark on purpose) · **lucide-react** icons (relevance-first; the thin hairline stroke matches the hairline-border system, and the set is shared with the sibling RantAI apps) · **sonner** toasts
- **react-markdown + remark-gfm** for assistant markdown (lightweight; streamdown is a drop-in upgrade later)
- Package manager: **npm** (`package-lock.json` is the source of truth; the older `bun.lock` predates the switch)

Theme tokens (OKLCH; dark is canonical - the `.light` block is brand-gated for future light brands, not user-facing), Geist + Geist Mono via next/font, and the brand logo live in this repo: see the "RantAI Design System" header in `src/app/globals.css` and `src/lib/branding.ts`.

## 4. Architecture — server-side proxy (no CORS, no token in browser)

```
Browser ──fetch──▶ Next.js route handlers ──fetch(+Bearer)──▶ RantaiClaw gateway /api/v1/*
         (same origin)        (server-side)                     (127.0.0.1:3000)
```

- The browser **never** talks to the gateway directly and **never** sees the bearer token.
- `src/app/api/rc/[...path]/route.ts` — generic JSON proxy (GET/POST/PUT) → gateway `/api/v1/*`.
- `src/app/api/chat/route.ts` — dedicated **SSE relay**: opens `POST /api/v1/agent/chat` with
  `Accept: text/event-stream` and pipes the event stream straight back to the browser.
- Server config via env:
  - `RANTAICLAW_GATEWAY_URL` (default `http://127.0.0.1:3000`)
  - `RANTAICLAW_TOKEN` (bearer; omitted when the gateway runs `require_pairing=false`)

Security posture inherited from the references: loopback bind, token server-side only,
SSH-tunnel/Tailscale as the blessed remote path. (See §8.)

## 5. RantaiClaw API contract (consumed)

Base: `${RANTAICLAW_GATEWAY_URL}/api/v1`. Auth: `Authorization: Bearer <token>` when paired.

| Method | Path | Notes |
|---|---|---|
| POST | `/agent/chat` | body `{message, model?, provider?, temperature?}`. SSE when `Accept: text/event-stream`. |
| GET | `/sessions?limit` | `{sessions:[{id,title,model,started_at,message_count}],count}` |
| GET | `/sessions/{id}` | `{id,title,model,started_at,messages:[{role,content,timestamp}]}` |
| POST | `/sessions/search` | body `{query,limit?}` → `{results:[{session_id,session_title,role,content,timestamp,rank}]}` |
| PUT | `/sessions/{id}/title` | body `{title}` |
| GET | `/status` | version, provider, model, memory_backend, autonomy, workspace_dir, paired, runtime(health snapshot) |
| GET | `/doctor` | `{results:[{name,category,severity,message,hint,duration_ms}]}` |
| GET | `/insights` | totals + averages over sessions |
| GET | `/skills` · `/skills/{name}` | name, version, description, tags, tools |
| GET | `/memory?limit` · `/memory/stats` | entries + backend/health |
| GET/PUT | `/personality` | preset get/set (presets: default, concise_pro, friendly_companion, research_analyst, executive_assistant) |
| GET | `/channels` | `{configured:[...]}` |
| GET | `/providers` | `{providers:[{id,display_name,aliases,local}]}` |

### SSE event frames (`data: <json>`), discriminated by `type`:

- `chunk` `{type,text}` — append to assistant message
- `usage` `{type,model,prompt,completion,total,cost_usd}`
- `tool_call_start` `{type,id,name,args}` · `tool_call_end` `{type,id,ok,output_preview}`
- `reload_complete` · `compaction_start` · `compaction_complete` (informational)
- `error` `{type,message}`
- `done` `{type,text,cancelled}` — stream terminates after this frame

The table above is the original v1 surface and still holds, but the console now
consumes a much wider one. The authoritative inventory is `src/lib/api.ts`; by
area it adds: cron CRUD + run history (`cron`), skills content/enable/create/
install + ClawHub search, MCP server add/remove, memory add/get/delete, KB
groups/documents/upload/entity graph/document intelligence (`kb/groups`),
knowledge activation (`config/knowledge`), config + secrets (`config`,
`secrets`), autonomy + tool policy writes, provider model catalogs, Telegram
provisioning, session fork, and the tool-approval round trip.

## 6. Information architecture

One console shell (Next.js route `/chat`) with hash-routed views:

- **Left rail**: nav (Chat, Status, Channels, MCP Servers, Providers,
  Tools & Autonomy, Schedules, Skills, Knowledge Bases, Memory, Persona,
  Configuration), recent sessions (resume/search/rename/fork/export/delete),
  agent identity card, and the autonomy control.
- **Center**: the active view. Chat is the streaming thread + composer
  (attachments, model/provider pickers, Stop); every ops route renders its
  panel here, read-write wherever the gateway allows.
- **Right panel** (chat only): session context: runtime snapshot, channels
  online, per-session usage, active skills.

Differences from the original sketch: there is no separate Ops mode or
"Sessions"/"Usage" tab. Sessions live in the rail, usage folded into Status
and the right panel.

## 7. Status & remaining backend work

**Implemented (gateway changes on branch `feat/gateway-webui-api`):**

1. **Multi-turn continuity** ✅ — `ChatRequestBody` now takes `session_id`; the gateway replays
   prior messages into the agent (`Agent::seed_history`, capped at 60) and appends the new turn to
   the **same** session. The `done` SSE frame (and sync response) return the `session_id`, so a
   fresh chat captures its id mid-stream and continues seamlessly. Resuming a session continues it.
2. **Session delete** ✅ — `DELETE /api/v1/sessions/{id}` + `SessionStore::delete_session`
   (transactional; detaches child sessions, FTS kept in sync). Wired to the trash action in the UI.
3. **Cron** ✅ — `GET /api/v1/cron` + full CRUD: `POST /cron` (agent jobs), `PUT /cron/{id}`
   (incl. enable/disable), `DELETE /cron/{id}`, `POST /cron/{id}/run` (`execute_job_now`).
4. **Skills enable/disable** ✅ — `PUT /api/v1/skills/{name}/enabled`; `skills_list` now reports
   `enabled`/`active`/`reasons` and lists disabled skills too.
5. **Config view + edit** ✅ — `GET /api/v1/config` (secrets redacted) + `PUT /api/v1/config/model`.
6. **Secrets** ✅ — `GET /api/v1/secrets` (presence only) + `PUT /api/v1/secrets` (active provider
   key, encrypted at rest via `Config::save()`, never echoed).
7. **Personality** ✅ — `PUT /api/v1/personality` wired into the Persona panel.
8. **Auth** ✅ (frontend) — optional password gate (`src/proxy.ts` + signed HttpOnly cookie),
   enabled per `docs/auth.md`; the cookie is signed with `RANTAICLAW_UI_SECRET`.

This brings the management surface to **minimal parity with the Hermes web UI**.
The console has since grown well past this list (MCP servers, tools & autonomy
policy, schedules, knowledge bases with document intelligence and an entity
graph, memory management, a config panel, ClawHub skills, web approvals);
`src/lib/api.ts` and section 5's addendum are the accurate inventory.

**Deliberately out of scope (backend-blocked or too heavy for "minimal"):**

- **Usage/cost analytics** — RantaiClaw does not compute or persist per-turn token/cost
  (`empty_usage` returns zeros; `CostTracker` is unused). Needs token accounting wired out of
  provider responses first.
- **Embedded PTY terminal** (Hermes's `/api/pty` xterm.js) — needs a WebSocket/PTY bridge.
- **Chat polish** — voice input, slash-command palette, logs viewer. (File
  attachments shipped since: ingest in the composer + KB retrieval on send.)
- Cron over HTTP creates **agent** jobs only; shell jobs stay CLI-only (no arbitrary-command surface).

## 8. Security

- Default bind loopback; proxy holds the token server-side; nothing secret reaches the browser.
- Remote access: SSH tunnel (`ssh -N -L 3939:127.0.0.1:3939 user@host`) or Tailscale — never raw exposure.
- No secrets logged. `.env.local` is git-ignored.

## 9. Run

Two separate repos: the runtime ([RantAIClaw](https://github.com/RantAI-dev/RantAIClaw)) and this UI.

```bash
# 1. backend (from the RantAIClaw repo, or an installed binary)
rantaiclaw gateway --host 127.0.0.1 -p 3000
# pair once, capture token -> .env.local : RANTAICLAW_TOKEN=...
# (npm run dev:full wraps scripts/dev.sh, which automates gateway + pairing)

# 2. UI (this repo)
npm install && npm run dev   # http://127.0.0.1:3939
```
