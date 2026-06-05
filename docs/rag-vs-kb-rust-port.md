# Our plan vs the existing `feat/kb-rust-port` branch (rantaiclaw)

**Bottom line: the native Rust RAG we were going to build (P1) ALREADY EXISTS** as the
`feat/kb-rust-port` branch in the rantaiclaw submodule — and it's MORE complete than what we scoped
(more complete than qmd). The work collapses from "build RAG" to "**integrate the existing KB + wire the
UI to `/api/v1/kb/*`**."

## What the branch is
A complete, parity-tested native Rust KB/RAG subsystem at `packages/rantaiclaw/src/kb/` (~32k LOC, ~40
modules, extensive `tests/kb/`). It is a Rust port of the TS RAG in the main app, **strictly isolated from
`memory/`** (KB = org documents; `memory/` = agent short-term memory — no cross-import). This directly
answers our earlier "doc collection vs agent memory" question: they built a **dedicated KB store**.

### Pipeline (matches the SOTA/qmd recipe we designed)
- **Ingest:** upload → extractor dispatch (smart-router: unpdf fast-path + LLM/MinerU fallback by
  text-layer signal; vision-LLM; office docx/xlsx behind `kb-office`; image; markdown; text) → smart
  chunker (block-aware, ~1000 char / 200 overlap) → optional **contextual-prefix** (Anthropic pattern) →
  batched embed → store.
- **Storage:** **sqlite-vec (vectors) + sqlite FTS5 (BM25) + rusqlite (metadata)**, one `kb.db` per org.
  (Same lean local stack as qmd; feature `kb-lancedb` for >100k chunks.)
- **Retrieve:** optional **query expansion** → parallel **vector + BM25** → **RRF fusion (k=60)** →
  optional **rerank (LLM / Cohere / vLLM)** → top-K (default 8) → formatted context block.
- **Embeddings:** OpenRouter `/embeddings` (default `qwen/qwen3-embedding-8b`, 4096-dim) or **TEI** on-prem.
  + embedding cache, **drift detection**, **bulk re-embed**.
- **Lean:** binary-size budget guard (<2 MB delta); heavy deps feature-gated (`rag-pdf`, `kb-office`,
  `kb-lancedb`).
- **Parity-tested** against `tests/fixtures/rag-golden.json` (hit@8 recall = 0.867) + criterion latency bench.

### Three surfaces (already built)
1. **Rust lib API** (in-process agent calls).
2. **CLI** `rantaiclaw kb search/ingest/list/get/delete/drift/re-embed` (TOON output).
3. **HTTP API `/api/v1/kb/*`** on the gateway — what the UI would call:
   - `POST /api/v1/kb/search`
   - `POST /api/v1/kb/documents` (ingest) · `GET` (list)
   - `GET` / `DELETE /api/v1/kb/documents/{id}`
   - `GET /api/v1/kb/drift` · `POST /api/v1/kb/re-embed`
4. **Agent integration:** ambient KB-context injection into the system prompt + a `knowledge_search` tool.

## Comparison to our plan
| Our plan | Branch reality |
|---|---|
| P1 "build native RAG (qmd recipe)" | **Already built**, exceeds qmd (vision extract, MinerU, 3 rerankers, contextual, query-expansion, drift, multi-org, parity-tested) |
| Reuse `memory/` chunker/embed/vector | Branch uses a **dedicated `kb/`** store (cleaner; isolated from memory) |
| P0 "agent reads file via file_read" | Can instead **ingest to `/api/v1/kb/documents`** → agent retrieves via KB |
| Image track (vision) | Branch ingests images via **vision-LLM (gpt-4o-mini) / local OCR** → document-images covered at ingest |

## What changes
- **Don't build RAG.** Integrate the branch.
- New shape:
  1. **Integrate `feat/kb-rust-port`** into the rantaiclaw build (merge/enable, set up embeddings via
     OpenRouter key or TEI sidecar, verify `/api/v1/kb/*`).
  2. **Wire rantaiclaw-ui:** attach button → `POST /api/v1/kb/documents` (ingest) → agent answers via KB
     (ambient injection / `knowledge_search`). Show ingest status + citations.
  3. **UX mapping decision:** the KB is **org-level / persistent** (categories, groups, `kb.db` per org),
     NOT per-chat ephemeral. Either (a) scope chat attachments to a per-session category/group, or (b)
     embrace a persistent knowledge base (closer to Hermes qmd / NotebookLM, arguably better).

## Caveats to verify before committing
- The branch is **not merged** to rantaiclaw `main` (feature branch, also on remote `datavault`).
  Merge-readiness / CI status unknown — verify it builds + tests pass on a current checkout.
- Needs an **embedding endpoint** (OpenRouter key with `qwen3-embedding-8b`, or a TEI sidecar). Rerank is
  optional. PDF/office behind feature flags.
- KB semantics = persistent org documents; mapping to "attach to THIS chat" UX needs a scoping decision.

## Revised recommendation
Drop the "build native RAG" track. **Integrate `feat/kb-rust-port`** and make the rantaiclaw-ui attachment
feature a thin client over `/api/v1/kb/*`. This is dramatically less work than building RAG, and lands a
more capable, parity-tested SOTA KB than qmd or our P1 design.
