# Reference — how Hermes handles document/file attachments & RAG (for rantaiclaw-ui)

Goal: model rantaiclaw-ui's attachment feature on the **Hermes Agent web UI** (`nesquena/hermes-webui`)
+ Hermes Agent backend (`NousResearch/hermes-agent`).

## How Hermes does it

### 1. Web UI: upload → per-session attachment inbox (filesystem)
- `POST /api/upload` (multipart/form-data, custom parser). Size cap `MAX_UPLOAD_BYTES` (~20 MB) → `413` if over.
- Files saved to an **attachment inbox** `STATE_DIR/attachments/<session_id>/` (env `HERMES_WEBUI_ATTACHMENT_DIR`),
  deliberately **separate from the active workspace**. Persist across reloads.
- Filename sanitization (`[^\w.\-]`→`_`, ≤200 chars). `.zip`/`.tar` auto-extract with zip-slip + zip-bomb protection.
- Frontend previews: text (inline), code (Prism.js), markdown (rendered), images (inline), binary (download).
  Messages can link `workspace://path` to open files in the right-side preview pane.

### 2. Agent reads files via its own tools (shared filesystem)
- Hermes web UI and the agent run on the **same host/filesystem** (Hermes is a Python source install).
- The UI drops the file on disk; the **agent reads it with its filesystem/tools** (and `workspace://` refs).
  Documents are NOT pushed through the chat API as text — the agent reads local files directly.
  (DeepWiki notes the exact UI→agent handoff is under-documented, but this is the model.)

### 3. RAG is a SEPARATE, optional local skill (`qmd`) — the knowledge-base path
- Distinct from one-off chat attachments (tracked in hermes-agent issues #531 workspace/KB, #844 knowledgebase RAG).
- `qmd` skill = **hybrid retrieval**: BM25 keyword (SQLite **FTS5**) + vector semantic (**sqlite-vec**) + **LLM rerank**.
- **All local**, local embeddings. User points at a document directory; agent auto-indexes, embeds, retrieves
  relevant content into context during conversations. A persistent knowledge base, not per-chat ephemeral.

**Takeaway:** Hermes leans on (a) **shared filesystem + agent file tools** for attachments, and (b) an
**optional local hybrid-RAG skill** for big knowledge bases. It does NOT stuff document text through the chat API.

## The gap in rantaiclaw

rantaiclaw-ui is a **thin HTTP client**; the gateway exposes only these `/api/v1` routes
(`packages/rantaiclaw/src/gateway/api_v1.rs:33-53`):

```
version, status, doctor, agent/chat(POST text), sessions(list/search/get/title),
insights, skills(list/show), memory(GET list, GET stats), personality, channels, providers
```

- **No file-upload endpoint.** Can't push a file to the agent's workspace over HTTP.
- **No memory-ingest endpoint** (`/memory` is GET-only). Can't push document chunks into the agent's
  embeddings store via the API. (And `embedding_provider="none"` in config — embeddings are off.)
- The only chat input is `agent/chat`'s `message: String`.

So the Hermes pattern (UI writes file → agent reads via tools / qmd RAG) is **not reachable through the
current gateway API**. Closing the gap needs one of the paths below.

## Paths to mirror Hermes

### Path 1 — Hermes-faithful: agent reads files (co-located filesystem)
- UI (co-located with the agent on the same box) writes the attachment into the agent's **workspace**
  (e.g. `<claw_home>/workspace/attachments/<session>/`), then the chat `message` references the path; the
  agent's `file_read` tool reads it on demand. No document text through the API → no context bloat; agent
  pulls only what it needs.
- For large docs / knowledge base: add a **qmd-style RAG skill** to the rantaiclaw agent (hybrid BM25 +
  sqlite-vec + rerank, local embeddings). rantaiclaw supports skills, so this *may* be a skill rather than
  core Rust — needs verification of skill execution capabilities.
- Pros: faithful to Hermes; agent-native; scales to large docs via tools/RAG. Cons: requires UI↔agent
  **co-location/filesystem access** (fine for single-box self-host); RAG skill is real work; depends on the
  agent having `file_read` enabled + path in the prompt.

### Path 2 — UI-layer RAG (gateway untouched, NOT Hermes-like)
- UI server does everything: extract (officeparser) → chunk → embed → store (sqlite-vec) → retrieve top-K →
  inject chunks into the `message`. Gateway stays a dumb text endpoint.
- Pros: no gateway/agent change, pure HTTP. Cons: does **not** mirror Hermes; duplicates retrieval infra in
  the UI; makes the thin client **stateful** (needs a volume); document text still flows through the chat API.

### Path 3 — Gateway gains an upload/ingest endpoint (explicit Hermes parity)
- Add `POST /api/v1/upload` (→ workspace inbox) and/or a memory-ingest endpoint to the gateway, then Path 1's
  agent-reads/RAG on top. Cleanest parity but a **high-risk gateway change** (per `packages/rantaiclaw/CLAUDE.md`).

## Open question for the user
Mirror Hermes faithfully (Path 1/3: agent reads files + a local hybrid-RAG skill — needs co-location and/or
gateway/agent work), or stay a thin client (Path 2: UI-layer RAG, not Hermes-like but no gateway change)?
