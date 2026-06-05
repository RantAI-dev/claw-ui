# Feasibility — attaching documents / images as chat context (rantaiclaw-ui)

Question: can the web-UI chat accept **documents** and **images** as extra context, like a typical LLM chat?

## TL;DR
- **Documents (as text context): YES, client-side, no gateway change.** Extract text in the browser and
  inject it into the message string. Easy win.
- **Images: NOT free today.** The runtime has the plumbing, but (1) the endpoint this UI uses does **not**
  run the multimodal prep, and (2) the active provider reports `vision: false`. Needs a gateway/agent
  change **and** a vision-capable model.

## What the stack actually does

Chat path: UI input → `POST /api/chat` (relay) → gateway `POST /api/v1/agent/chat` → `Agent::turn()`.

The gateway request body accepts only text:
```rust
// packages/rantaiclaw/src/gateway/api_v1.rs:199
struct ChatRequestBody { message: String, model, provider, temperature }   // no images/attachments
```

### Image support exists in the runtime — but not on this endpoint
- Images travel as inline markers `[IMAGE:data:image/...;base64,...]` inside the message string
  (`packages/rantaiclaw/src/multimodal.rs`, prefix `"[IMAGE:"`).
- `multimodal::prepare_messages_for_provider()` turns those markers into real provider image payloads,
  gated by `provider.supports_vision()` and `[multimodal]` config (`max_images=4`, `max_image_size_mb=5`,
  `allow_remote_fetch`).
- **Crucial gap:** `prepare_messages_for_provider` is only called from `run_tool_call_loop`
  (`loop_.rs:1358`) and `force_final_summary` (`loop_.rs:1711`). The gateway's **channel/webhook** path
  uses that loop (`gateway/mod.rs:983`). But the **api_v1 `agent/chat`** path used by this UI goes through
  `Agent::turn → turn_inner`, which builds provider messages via
  `self.tool_dispatcher.to_provider_messages(&self.history)` (`agent.rs:903,1054`) — **no multimodal prep**.
  → `[IMAGE:...]` markers sent via this UI are passed as literal text, not images.
- **Provider gap:** `default_provider="minimax"` resolves to the OpenAI-compatible provider
  (`compatible.rs`), whose `capabilities()` returns `vision: false` (`compatible.rs:1132`). Even on the
  multimodal path it would be rejected with a "provider does not support vision" capability error.
  Vision-capable today: Ollama vision models, Bedrock, rig_native (`vision: true`).

### Documents: no native channel
- There is no document/attachment field on the chat endpoint; the message is text only.
- The agent has a `[memory]` subsystem (sqlite + embeddings) and a `file_read` tool, but neither is a
  per-message "attach this doc as context" path driven from the UI.

## Options

### A. Documents as inline text context — client-side only (recommended first)
- UI: add an attach button; read the file in the browser; for text/markdown/code/csv use the raw text;
  for PDF use a parser (e.g. pdf.js). Inject into the **sent** message (hidden from the bubble, same
  pattern as the existing `GUI_INSTRUCTION` decorate) as e.g.:
  `"<user text>\n\n[Attached: report.pdf]\n\"\"\"\n<extracted text>\n\"\"\""`.
- Show a file chip in the bubble; strip the injected block on history reload (same approach as the
  render-mode fix).
- No gateway change. Cost: a PDF/text-extraction lib + input UI. Limit by char budget (model context).

### B. Images — requires runtime work
1. **Gateway/agent change:** route the api_v1 `agent/chat` path through the multimodal-aware loop (or make
   `Agent::turn` apply `prepare_messages_for_provider`). High-risk path per
   `packages/rantaiclaw/CLAUDE.md` (gateway/agent); needs tests + threat notes.
2. **Vision model:** switch the active provider/model for image turns to a vision-capable one
   (Ollama vision / Bedrock / a vision model whose provider declares `vision: true`).
3. **UI:** attach button → base64 → embed `[IMAGE:data:...]` marker in the sent message (hidden from the
   bubble), enforce `max_images`/`max_image_size_mb`, show a thumbnail.

### C. Documents as durable knowledge (heaviest)
- Ingest the doc into the agent's memory/embeddings so it persists across turns/sessions. Largest lift;
  only worth it if persistence/RAG across the conversation is the goal, not one-shot context.

## Recommendation
Start with **A** (documents as inline text) — real value, UI-only, no gateway risk. Treat **B** (images)
as a separate, larger effort that needs a gateway change + a vision-capable model; don't promise it as a
quick add.
