"use client";

import * as React from "react";
import { streamChat } from "@/lib/chat-stream";
import type { ChatEvent, ChatMessage, SessionMessage, ToolCall } from "@/lib/types";

let idSeq = 0;
function nextId(prefix: string) {
  idSeq += 1;
  return `${prefix}-${idSeq}-${Math.round(Math.random() * 1e6)}`;
}

export interface UseChatOptions {
  model?: string;
  provider?: string;
  temperature?: number;
  /** "gui" steers the model to emit an OpenUI-style ```ui block for rich rendering. */
  renderMode?: "md" | "gui";
  /**
   * Called on each send (when wired) to fetch KB context for the query, scoped
   * to the conversation id. The returned `context` is injected into the SENT
   * message only (never the displayed bubble); `sources` (document titles) are
   * stored on the assistant turn for citation chips. Must never throw.
   */
  retrieveContext?: (
    userText: string,
    conversationId: string,
  ) => Promise<{ context: string; sources: string[] }>;
}

// Appended (to the SENT message only, not the displayed bubble) when the user
// chooses Generative UI rendering. Appending (vs prepending) keeps the user's
// own first line intact, so the gateway's derived session title stays clean.
// Keeps the gateway/agent untouched.
const GUI_INSTRUCTION = [
  "[RENDER MODE: GENERATIVE UI]",
  "When a structured, data-heavy, or interactive answer would help, include ONE fenced code block with language `ui` holding a JSON array of components (plus optional prose around it). Otherwise reply normally in markdown.",
  "Components: ",
  '{"type":"heading","text":"..."}, {"type":"text","text":"markdown"}, {"type":"divider"},',
  '{"type":"card","title":"...","tone":"sky|green|amber|red|purple","children":[...nested components...]},',
  '{"type":"metrics","items":[{"label":"p95","value":"41ms","tone":"green"}]},',
  '{"type":"keyvalue","items":[{"k":"model","v":"..."}]},',
  '{"type":"table","columns":["A","B"],"rows":[["1","2"]]},',
  '{"type":"list","items":["..."]}, {"type":"badges","items":[{"label":"OK","tone":"green"}]},',
  '{"type":"callout","tone":"amber","text":"..."},',
  '{"type":"choices","prompt":"Pick one","options":[{"label":"Yes","value":"yes"}]}.',
  "Keep the JSON strictly valid. `choices` options send their value back as the next user message.",
  "---",
  "",
].join("\n");

// KB context + prior-conversation history are wrapped in these sentinels in the
// SENT message so they can be stripped from the displayed bubble on history
// reload (both are rebuilt fresh each turn and must never resurface as user text).
const KB_OPEN = "<<<KB_CONTEXT>>>";
const KB_CLOSE = "<<<END_KB_CONTEXT>>>";
const HIST_OPEN = "<<<CONVERSATION_SO_FAR>>>";
const HIST_CLOSE = "<<<END_CONVERSATION>>>";

const MAX_HISTORY_MSGS = 8; // last ~4 exchanges
const MAX_HISTORY_CHARS = 1500; // per message, to bound the request body size

/** Append KB context after the user's text (before any GUI instruction). */
function withKbContext(text: string, context: string): string {
  return context.trim() ? `${text}\n\n${KB_OPEN}\n${context}\n${KB_CLOSE}` : text;
}

/** Build a compact transcript of recent turns so the (stateless) gateway agent
 *  gets conversation memory. Returns "" when there is no prior turn. */
function buildHistory(prior: ChatMessage[]): string {
  const turns = prior.filter((m) => m.role === "user" || m.role === "assistant");
  if (turns.length === 0) return "";
  return turns
    .slice(-MAX_HISTORY_MSGS)
    .map((m) => {
      const who = m.role === "user" ? "User" : "Assistant";
      const body =
        m.content.length > MAX_HISTORY_CHARS ? `${m.content.slice(0, MAX_HISTORY_CHARS)}…` : m.content;
      return `${who}: ${body}`;
    })
    .join("\n");
}

/** Append prior-conversation history after the user's text. */
function withHistory(text: string, history: string): string {
  return history.trim()
    ? `${text}\n\n${HIST_OPEN}\n(earlier messages in this conversation, for context)\n${history}\n${HIST_CLOSE}`
    : text;
}

/** Strip appended decorations (history + KB context + GUI instruction) for display. */
function stripDecorations(content: string): string {
  let c = content;
  if (c.endsWith(GUI_INSTRUCTION)) c = c.slice(0, c.length - GUI_INSTRUCTION.length);
  c = c.replace(new RegExp(`\\n*${KB_OPEN}\\n[\\s\\S]*?\\n${KB_CLOSE}`, "g"), "");
  c = c.replace(new RegExp(`\\n*${HIST_OPEN}\\n[\\s\\S]*?\\n${HIST_CLOSE}`, "g"), "");
  return c.replace(/\s+$/, "");
}

export function useChat(opts: UseChatOptions) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  // Stable client-side id used to scope KB attachments + retrieval per chat.
  const [conversationId, setConversationId] = React.useState<string>(() => nextId("c"));
  const abortRef = React.useRef<AbortController | null>(null);
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  // Read the current ids at call time (not closure-captured).
  const sessionIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  const conversationIdRef = React.useRef<string>(conversationId);
  React.useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  // Mirror messages so send() can read prior turns at call time without
  // capturing them in its dependency list.
  const messagesRef = React.useRef<ChatMessage[]>(messages);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const patch = React.useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  // Decorate the SENT message (not the displayed one) with the GUI spec in gui mode.
  // Appended after the user's text so the first line — and thus the gateway's
  // session title — stays the real question.
  const decorate = React.useCallback(
    (text: string) => (optsRef.current.renderMode === "gui" ? `${text}\n\n${GUI_INSTRUCTION}` : text),
    [],
  );

  // Retrieve KB context for a query. No-op unless a retriever is wired (and it
  // decides attachments are ready). Never throws — retrieval must not block send.
  const retrieve = React.useCallback(async (userText: string) => {
    const rc = optsRef.current.retrieveContext;
    if (!rc) return { context: "", sources: [] as string[] };
    try {
      const r = await rc(userText, conversationIdRef.current);
      return { context: r.context || "", sources: r.sources || [] };
    } catch {
      return { context: "", sources: [] as string[] };
    }
  }, []);

  // Core turn runner — appends an assistant message and streams into it.
  const runAssistant = React.useCallback(
    async (userContent: string, sources: string[] = []) => {
      const assistantId = nextId("a");
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        toolCalls: [],
        usage: null,
        error: null,
        sources: sources.length ? sources : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const onEvent = (ev: ChatEvent) => {
        switch (ev.type) {
          case "chunk":
            patch(assistantId, (m) => ({ ...m, content: m.content + ev.text }));
            break;
          case "tool_call_start":
            patch(assistantId, (m) => ({
              ...m,
              toolCalls: [...(m.toolCalls || []), { id: ev.id, name: ev.name, args: ev.args, done: false } as ToolCall],
            }));
            break;
          case "tool_call_end":
            patch(assistantId, (m) => ({
              ...m,
              toolCalls: (m.toolCalls || []).map((t) =>
                t.id === ev.id ? { ...t, ok: ev.ok, outputPreview: ev.output_preview, done: true } : t,
              ),
            }));
            break;
          case "usage":
            patch(assistantId, (m) => ({ ...m, usage: { total: ev.total, cost_usd: ev.cost_usd } }));
            break;
          case "error":
            patch(assistantId, (m) => ({ ...m, error: ev.message }));
            break;
          case "done":
            // Capture the session the backend persisted this turn to, so the
            // next message continues the same conversation (multi-turn).
            if (ev.session_id) setSessionId(ev.session_id);
            patch(assistantId, (m) => ({
              ...m,
              streaming: false,
              content: m.content || (ev.cancelled ? "_(stopped)_" : ev.text || ""),
            }));
            break;
          default:
            break;
        }
      };

      await streamChat(
        {
          message: userContent,
          model: optsRef.current.model,
          provider: optsRef.current.provider,
          temperature: optsRef.current.temperature,
          session_id: sessionIdRef.current ?? undefined,
        },
        onEvent,
        controller.signal,
      );

      setIsStreaming(false);
      abortRef.current = null;
    },
    [patch],
  );

  const send = React.useCallback(
    async (text: string, attachments?: string[]) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      // Prior turns (before this one) → conversation memory for the stateless gateway.
      const history = buildHistory(messagesRef.current);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId("u"),
          role: "user",
          content: trimmed,
          attachments: attachments?.length ? attachments : undefined,
        },
      ]);
      const { context, sources } = await retrieve(trimmed);
      await runAssistant(decorate(withKbContext(withHistory(trimmed, history), context)), sources);
    },
    [isStreaming, runAssistant, decorate, retrieve],
  );

  /** Re-run the most recent user turn, replacing the last assistant reply. */
  const regenerate = React.useCallback(async () => {
    if (isStreaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // History = turns before the one being regenerated.
    const at = messages.lastIndexOf(lastUser);
    const history = buildHistory(at === -1 ? [] : messages.slice(0, at));
    // Drop everything after the last user message (keyed on the object ref so
    // it's correct even if `prev` differs from this render's snapshot).
    setMessages((prev) => {
      const i = prev.lastIndexOf(lastUser);
      return i === -1 ? prev : prev.slice(0, i + 1);
    });
    const { context, sources } = await retrieve(lastUser.content);
    await runAssistant(decorate(withKbContext(withHistory(lastUser.content, history), context)), sources);
  }, [isStreaming, messages, runAssistant, decorate, retrieve]);

  const stop = React.useCallback(() => abortRef.current?.abort(), []);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages([]);
    setSessionId(null);
    setConversationId(nextId("c"));
  }, []);

  /** Load a past session transcript and continue it (multi-turn when backend supports session_id). */
  const loadHistory = React.useCallback((history: SessionMessage[], id: string | null) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setSessionId(id);
    setConversationId(id ?? nextId("c"));
    setMessages(
      history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: nextId("h"),
          role: m.role === "user" ? "user" : "assistant",
          // The gateway persists the SENT message, which may carry appended KB
          // context and/or the GUI instruction. Strip both so they never
          // resurface as a user bubble (and so regenerate() re-decorates clean).
          content: m.role === "user" ? stripDecorations(m.content) : m.content,
        })),
    );
  }, []);

  // Thread-level token/cost totals for the context panel.
  const totals = React.useMemo(() => {
    let tokens = 0;
    let cost = 0;
    let toolCalls = 0;
    for (const m of messages) {
      if (m.usage) {
        tokens += m.usage.total || 0;
        cost += m.usage.cost_usd || 0;
      }
      toolCalls += m.toolCalls?.length || 0;
    }
    return { tokens, cost, toolCalls, turns: messages.filter((m) => m.role === "user").length };
  }, [messages]);

  return {
    messages,
    isStreaming,
    sessionId,
    conversationId,
    send,
    regenerate,
    stop,
    reset,
    loadHistory,
    totals,
  };
}
