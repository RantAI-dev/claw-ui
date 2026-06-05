# RCA — "Generative UI" instruction leaks as `[RENDER MODE: GENERATIVE UI]…` in the transcript

## Symptoms (reported)
1. In **Generative UI** mode, asking `tell me about "miracle of istanbul"` renders normally.
2. After switching to **Markdown**, the message turns into the raw prompt text:
   `[RENDER MODE: GENERATIVE UI] When a structured, data-heavy … choices options send their value back…`
3. Switching **back** to Generative UI does **not** restore it — it stays broken.

## Root cause
The Generative-UI steering text is **prepended to the message that is sent to the gateway**, and the
gateway **persists that decorated text verbatim** as the user turn. On any session reload it comes
back and is rendered as-is.

Chain:

| Step | File | What happens |
|---|---|---|
| 1 | `src/hooks/use-chat.ts:23-38` | `GUI_INSTRUCTION` = the `[RENDER MODE: GENERATIVE UI]…` block. |
| 2 | `src/hooks/use-chat.ts:59-60` | `decorate(text)` = `GUI_INSTRUCTION + text` when `renderMode === "gui"`. |
| 3 | `src/hooks/use-chat.ts:145-146` | The **displayed** user bubble stores clean `trimmed`; the **sent** message is `decorate(trimmed)`. |
| 4 | gateway `src/gateway/api_v1.rs:199-207` | `ChatRequestBody` has only `message/model/provider/temperature` — **no system field**. |
| 5 | gateway `src/gateway/api_v1.rs:283-287` (sync) and `:312,64` (stream) | Persists `body.message` (the decorated text) verbatim as the user turn via `record_api_chat_session`. |
| 6 | `src/hooks/use-chat.ts:176-190` | `loadHistory` puts the gateway's stored user message into state **verbatim**. |
| 7 | `src/components/console/transcript.tsx:159-171` | `UserTurn` renders `m.content` verbatim and **ignores `renderMode`**. |

So the "displayed bubble is clean" trick (`use-chat.ts:21-22` comment) only protects the **live,
in-memory** turn. It does **not** survive the round-trip through the gateway's session store.

### Why each symptom
- **Symptom 1 (GUI normal):** live turn — user bubble is the clean text; assistant `​```ui` block renders as components.
- **Symptom 2 (leak on switch):** the displayed state is now a **reloaded** session, whose stored user
  message contains the full `GUI_INSTRUCTION`. (Note: the render-mode toggle by itself does not reload;
  the reload happens when the session is opened from the sidebar — `console-shell.tsx:191-200` →
  `api.session()` → `loadHistory`.)
- **Symptom 3 (irreversible):** `UserTurn` ignores `renderMode` entirely, and the polluted text is now
  baked into `messages` state. Toggling render mode re-renders the same verbatim content, so GUI can
  never hide it again. This is the decisive proof that the content was mutated by a reload, not merely
  re-rendered.

Confirmed by static tracing of the code paths (not a live model run).

## Fix options
- **A — Sanitize on ingest (recommended, surgical, no gateway change).** In `loadHistory`, strip a
  leading `GUI_INSTRUCTION` from user messages before putting them in state. Single ingestion point;
  also prevents `regenerate()` from double-prepending the instruction after a reload
  (`use-chat.ts:162` re-`decorate`s `lastUser.content`). Leaves the gateway untouched, matching the
  author's stated intent.
  - Residual: the gateway still **stores** the decorated text, so on multi-turn continuation the model
    re-reads the instruction and persisted history stays bloated (functionally harmless).
- **B — Move steering out of the user message (clean, larger).** Add a non-persisted `system`/
  instruction field to the gateway `agent/chat` endpoint and send `GUI_INSTRUCTION` there. High-risk
  gateway path per `packages/rantaiclaw/CLAUDE.md`; contradicts the "keep gateway untouched" comment.
  Best as a follow-up if we want stored conversations free of steering text.

## Implemented fix (Option A, append variant)
Two related leaks share the same cause (gateway persists the decorated message): the **transcript
bubble** and the **session title** (`derive_session_title()` in `packages/rantaiclaw/src/sessions/store.rs:17`
takes the first non-empty line — which for a *prepended* instruction is `[RENDER MODE: GENERATIVE UI]`).

Fix: **append** the instruction instead of prepending, so the user's own text stays the first line
(clean title for free), and strip the suffix on ingest.

```ts
// src/hooks/use-chat.ts

// decorate — append, not prepend
(text) => optsRef.current.renderMode === "gui" ? `${text}\n\n${GUI_INSTRUCTION}` : text

// loadHistory map — strip the appended suffix
content:
  m.role === "user" && m.content.endsWith(GUI_INSTRUCTION)
    ? m.content.slice(0, m.content.length - GUI_INSTRUCTION.length).replace(/\s+$/, "")
    : m.content,
```

Verified: `tsc --noEmit` clean; round-trip `strip(decorate(x)) === x`; `derive_session_title(decorate(x))`
returns the real first line (no marker); md-mode messages pass through untouched.

**Scope:** fixes **new** conversations only. Sessions created **before** this fix already have a
polluted stored message + title on the gateway — delete or rename those test sessions to clear them.
