# SOTA document-RAG for rantaiclaw — best practice, Hermes-referenced

Goal: SOTA document/attachment + RAG, modeled on Hermes Agent, adapted to rantaiclaw's architecture.

## Key finding: rantaiclaw already has most of the RAG engine
Don't build from scratch. Existing (`packages/rantaiclaw/src/`):
- `memory/embeddings.rs` — `EmbeddingProvider` trait + OpenAI-compatible client (works with **local** `/embeddings`
  servers too). Factory `create_embedding_provider`. Currently `embedding_provider="none"` → just turn it on.
- `memory/vector.rs`, `memory/chunker.rs`, `memory/sqlite.rs` — vector store + chunking + sqlite backend.
- Config already has `vector_weight` + `keyword_weight` + `chunk_max_tokens` + `min_relevance_score`
  → **hybrid (dense + keyword) retrieval already implemented**.
- Tools: `memory_recall`/`memory_store` (agentic retrieval), **`pdf_read`**, `file_read`, `glob_search`.

So Hermes' `qmd` (BM25 + vector + rerank, local) is ~80% already present. What's missing is: a **document
ingestion path**, a **doc-scoped retrieval tool**, **reranking**, and turning **embeddings on**.

## SOTA architecture (Hermes-aligned, rantaiclaw-native via traits)

```
UI upload ─▶ workspace/attachments/<session>/   (Hermes "inbox", shared FS)
                  │
        ┌─────────┴───────── Ingest (agent runtime, reuse memory/) ────────┐
        │  extract (pdf_read/officeparser) → chunk (chunker.rs)            │
        │  → embed (embeddings.rs, LOCAL model) → store in doc index       │
        │    (sqlite vector + keyword), scoped by session / collection     │
        └──────────────────────────────────────────────────────────────────┘
                  │
   Agent turn ─▶ calls `document_search` Tool ─▶ hybrid retrieve (vector+keyword,
                  RRF fuse) ─▶ RERANK (cross-encoder/LLM) ─▶ top-K chunks + citations
                  │
              grounded answer with source citations
```

Layers:
1. **Ingest:** UI writes file to workspace inbox (Hermes model, no gateway change if co-located). Agent-side
   indexer extracts → chunks → embeds → stores in a **document index** (reuse `memory/` engine, but a
   **separate collection** from conversational memory — keep SRP; don't pollute agent memory).
2. **Retrieve (agentic, SOTA):** a `document_search` Tool (Tool trait) the agent calls when relevant. Hybrid
   (existing vector_weight+keyword_weight) → **rerank** (the main missing piece) → return chunks + source refs.
   Agentic retrieval (agent decides when/what/multi-hop) beats static top-K injection.
3. **Direct read (small docs):** agent uses existing `pdf_read`/`file_read` — no RAG needed. This is "Phase 0".
4. **Generate:** grounded answer, cite filename + page/chunk.

## SOTA techniques (the deltas to add on top of what exists)
- **Turn on local embeddings.** Point `embedding_provider` at a local OpenAI-compatible `/embeddings` endpoint.
  Recommended model: **bge-m3** (multilingual incl. Indonesian, dense+sparse) or e5/gte/nomic-embed.
- **Reranking** (cross-encoder or LLM reranker) over fused candidates — biggest precision lever; rantaiclaw
  appears to lack it. This is the key new component.
- **Contextual retrieval** (Anthropic): prepend each chunk with a short LLM-generated context blurb before
  embedding → large recall boost. Optional SOTA polish.
- **Citations / grounding**: return source spans; reduces hallucination.
- **Query transforms** (rewrite / multi-query / HyDE): higher recall. Optional.
- **Structure-aware chunking** + overlap (respect headings/paragraphs).
- **Scoping:** per-session ephemeral attachment vs persistent knowledge base (Hermes #844 dir). Support both,
  index keyed by scope.

## Adapting to rantaiclaw (best-practice wiring per packages/rantaiclaw/CLAUDE.md)
- Add ingestion + `document_search` as **Tools** (`src/tools/`, Tool trait) + factory-register (§7.3).
- Reuse **Memory/vector** infra (`src/memory/`); add a document collection + a rerank step (§6.4 extend traits,
  don't rewrite). Reranker as a small trait + impl.
- Ingestion entry: **UI writes to workspace** (no gateway change) OR small `POST /api/v1/upload` +
  `POST /api/v1/documents/index` endpoints (bounded; high-risk gateway path → tests + threat notes).
- Config: new `[rag]`/document section; enable embeddings; choose local embedding endpoint/model.
- High-risk paths (`memory/`, `tools/`, `gateway/`) → run rantaiclaw lint gates + tests + rollback notes.

## Phasing (decompose — each phase = its own spec)
- **P0 — Hermes-basic (smallest, near-zero rantaiclaw change):** UI upload → workspace inbox; agent reads via
  existing `pdf_read`/`file_read`. Works for small/medium docs NOW. Ships the attachment UX.
- **P1 — SOTA core (qmd analog, native):** document ingestion into the hybrid memory/vector engine + enable
  local embeddings + `document_search` tool + citations. Handles many-page docs.
- **P2 — SOTA polish:** reranking, contextual retrieval, query transforms, persistent knowledge base, a small
  retrieval-eval harness (precision/recall on a fixture set).

## Honest scope
P1/P2 are real Rust work in high-risk subsystems (memory/tools/gateway). SOTA RAG is a serious build — but
rantaiclaw's existing hybrid-memory engine + chunker + embeddings + pdf_read cut it down a lot. The main new
pieces are: document ingestion, a doc-scoped search tool, and a reranker. Recommend building P0 first (real
value fast, validates UX), then P1, then P2 — mirroring how Hermes ships attachments first and `qmd` RAG as an
optional add-on.

## Verification results (2026-06-03)

1. **Chat agent already exposes `pdf_read` + `file_read`** (default tool set, `tools/mod.rs:164,308`; test
   asserts `file_read` present; `file_read` auto-approved in dev config, workspace-scoped). → **P0 needs ~no
   rantaiclaw change.**
2. **rantaiclaw skills can execute code, not just prompt text.** `tools/skill_tool.rs` wraps a skill's tools
   as real function-calling tools with `kind:"shell"` (runs `Command::new(program)`, e.g. `bun run script.js`
   / `python3 ...`) or `kind:"http"` (curl). Skills have install recipes (`rantaiclaw skills install-deps`).
   → **A qmd-style RAG CAN be a rantaiclaw skill that shells out to a retrieval binary** (Level 2 feasible).
3. **`memory/` store supports scoping:** `MemoryCategory::{Core,Daily,Conversation,Custom(name)}` + optional
   `session_id`; `recall` filters by `category`+`session_id`. Has `chunker.rs`, `embeddings.rs` (pluggable),
   `vector.rs`. → A **document collection** can live as a custom category/session scope (repurposing) or a
   dedicated store; primitives already exist. (Trait `recall` is keyword; hybrid/vector is layered above.)
4. **qmd is a CLI binary that ALSO exposes an MCP server** (`qmd mcp` → tools `mcp_qmd_search`,
   `mcp_qmd_vsearch`, `mcp_qmd_deep_search`, `mcp_qmd_get`). It's `@tobilu/qmd` (npm, Node ≥22). Pipeline:
   query-expansion (1.7B) → parallel BM25(FTS5)+vector → RRF(k=60) → LLM rerank (qwen3-reranker-0.6b) →
   position-aware blend. Chunk ~900 tok/15% overlap. Models: embeddings-gemma-300M + qwen3-reranker-0.6b +
   expansion-1.7B (~2GB total, auto-download). Index at `~/.cache/qmd/index.sqlite`.

### Big implication: rantaiclaw has an MCP client → qmd can be reused as-is via MCP
rantaiclaw already has MCP integration (client manager + tool adapter). qmd exposes an MCP server. So the
agent can get qmd's retrieval tools **with zero rantaiclaw Rust changes** — just install qmd, run `qmd mcp`,
register it as an MCP server, and `qmd collection add` the uploaded docs.

## P1 (RAG) — two verified paths
- **P1-MCP (max Hermes fidelity, min rantaiclaw effort):** reuse the actual qmd engine via MCP. Literally
  Hermes' RAG. Cost: Node ≥22 + ~2GB models + qmd as an optional external runtime (heavier footprint, against
  the "lightest" thesis — but self-contained and optional, exactly like Hermes ships qmd as optional).
- **P1-native (lean, more work):** implement the qmd recipe (hybrid + RRF + rerank, 900/15% chunking) on
  rantaiclaw's own `memory/` engine, packaged as a skill (Level 2) or core. Honors rantaiclaw's lean identity;
  the genuinely new piece is the reranker.

Both sit behind the same P0 attachment UX; P0 is unchanged either way.
