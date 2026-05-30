# rantaiclaw-ui — status

Standalone **Next.js 16 + shadcn + React 19 + Tailwind v4** web UI for RantaiClaw — Hermes-style
chat + OpenClaw-style ops. Reuses design tokens / fonts / logo from your **RantAI-Agents** app.

**State: prod-ready v1.** Frontend + the gateway endpoints it needs are implemented, tested, linted,
and verified end-to-end. Screenshots: `.shots/`.

---

## Two repos, two commits

| Repo | Branch | What |
|---|---|---|
| `packages/rantaiclaw-ui` | `main` (own git) | the web UI (this repo) |
| `packages/rantaiclaw` (Rust) | `feat/gateway-webui-api` | gateway endpoints for multi-turn, delete, cron |

The Rust branch was cut so your in-progress `feat/tui-rantai-logo` TUI work (uncommitted mascot edits)
is untouched. Nothing pushed. Merge the Rust branch when you're ready.

---

## What's implemented

**Chat:** streaming (SSE) · **multi-turn** (continues the same session; the gateway replays history
and returns the `session_id`) · session resume / **full-text search** / rename / **delete** ·
**syntax-highlighted** code blocks · **regenerate** · tool-call cards · model/provider switch · Stop ·
**3-panel** layout with a context/details side panel · connection/pairing banner.

**Ops:** live metric bar + panels — status & doctor, sessions, usage, providers, channels, **cron**,
skills, memory, persona.

**Gateway (Rust, `feat/gateway-webui-api`):**
- `Agent::seed_history` — replay prior turns into a resumed session (capped at 60).
- `POST /api/v1/agent/chat` now takes `session_id`; appends to the same session and returns its id.
- `DELETE /api/v1/sessions/{id}` + `SessionStore::delete_session` (transactional; detaches children; FTS-safe).
- `GET /api/v1/cron` — read-only scheduled-job listing.
- 4 new tests pass; `cargo fmt`, quality gate, and strict-delta gate all green.

**Hardening:** server-side proxy (token never in the browser) · CSP + security headers · standalone
**Dockerfile** + `.dockerignore` · `/api/health` · error boundary + 404 · graceful gateway-down.

---

## Run

```bash
# rebuild the gateway with the new endpoints (Rust branch is checked out)
cd packages/rantaiclaw && cargo build --release

# zero-config local dev (keyless dev gateway + UI):
cd ../rantaiclaw-ui && ./scripts/dev.sh        # → http://127.0.0.1:3939

# OR point at your real MiniMax agent (real LLM chat):
node scripts/setup-minimax.mjs                 # registers a token in your active profile
( cd ../rantaiclaw && ./target/release/rantaiclaw gateway --host 127.0.0.1 -p 3000 )
bun run dev
```

Docker: `docker build -t rantaiclaw-ui . && docker run -p 3939:3939 -e RANTAICLAW_GATEWAY_URL=http://host.docker.internal:3000 -e RANTAICLAW_TOKEN=… rantaiclaw-ui`

---

## Deliberately deferred (not rushed — see docs/DESIGN.md §7)

- **Usage/cost aggregation** — RantaiClaw doesn't compute/persist per-turn tokens yet (`empty_usage`
  returns zeros; `CostTracker` is unused). Needs real token accounting first; UI shows zeros until then.
- **Mutating ops** — config editor, cron create/edit/delete, skill toggle, secrets. Each needs new
  write endpoints + auth/audit design.

## Stop / clean up

```bash
kill $(cat packages/rantaiclaw-ui/.devserver.pid) 2>/dev/null            # UI
kill $(cat packages/rantaiclaw-ui/.devgateway/dev-gateway.pid) 2>/dev/null # dev gateway
```
`.env.local`, `.devgateway/`, `.shots/`, logs, `*.pid` are git-ignored.
