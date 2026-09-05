"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { streamChat } from "@/lib/chat-stream";
import type {
  ChatEvent,
  ChatMessage,
  SessionMessage,
  ToolCall,
} from "@/lib/types";
import { stripDecorations } from "@/lib/decorations";

/** A tool call paused awaiting the user's in-browser approve/deny decision. */
export interface PendingApproval {
  id: string;
  tool: string;
  args: unknown;
}

let idSeq = 0;
function nextId(prefix: string) {
  idSeq += 1;
  return `${prefix}-${idSeq}-${Math.round(Math.random() * 1e6)}`;
}

/**
 * A conversation id the gateway will adopt as the session id.
 *
 * Must be UUID-shaped — `record_api_turn` ignores anything else and mints its
 * own, which is exactly the mismatch this exists to avoid. `randomUUID` needs a
 * secure context; the console is served over loopback or HTTPS, but fall back
 * rather than throw so a plain-http LAN bind still works.
 */
export function newConversationId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const hex = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
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




/** Mark any still-running tool chip as finished — used when a turn ends without
 *  a `tool_call_end` (cancelled/aborted, or a dropped end frame) so the Activity
 *  disclosure doesn't pulse "Running" forever. */
/** Close out calls still marked running when the turn ends. A turn that was
 *  stopped or denied marks them `cancelled` so the chip reads "stopped", not
 *  "err" (nothing failed) or "ok" (nothing ran). */
function finalizeToolCalls(tools?: ToolCall[], cancelled = false): ToolCall[] | undefined {
  if (!tools?.length) return tools;
  return tools.map((t) =>
    t.done ? t : { ...t, done: true, ok: t.ok ?? false, cancelled: cancelled || undefined },
  );
}

export function useChat(opts: UseChatOptions) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  // Tools the agent paused on, awaiting in-browser approve/deny. A FIFO queue,
  // so a second request that arrives before the first is answered is not lost
  // (it used to overwrite the first, which was then auto-denied at the gateway
  // deadline with no UI trace). The head is what the modal shows.
  const [approvalQueue, setApprovalQueue] = React.useState<PendingApproval[]>([]);
  const pendingApproval = approvalQueue[0] ?? null;
  // Stable id used to scope KB attachments + retrieval per chat, AND sent as
  // `session_id` on the first turn so the gateway adopts it (RantAIClaw #289).
  //
  // It has to be a UUID, not `nextId("c")`. Attachments are ingested into the
  // KB under this id at *upload* time — before any session exists — so if the
  // gateway then minted its own id, reopening the session would search the KB
  // under an id the documents were never stored against, and every attachment
  // in that conversation became silently unreachable. The gateway only adopts a
  // caller-supplied id when it is UUID-shaped.
  const [conversationId, setConversationId] = React.useState<string>(() =>
    newConversationId(),
  );
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
  // Synchronous latch: `isStreaming` only flips true inside runAssistant, AFTER
  // send()'s `await retrieve()`, so without this a fast second send slips through
  // the guard and starts a duplicate concurrent turn.
  const inFlightRef = React.useRef(false);
  // Bumped by reset()/loadHistory() to invalidate an in-flight send/regenerate
  // whose conversation was switched out from under it during `await retrieve()`.
  const epochRef = React.useRef(0);
  // Mirror of pendingApproval so resolveApproval can restore it on a failed POST.
  const pendingApprovalRef = React.useRef<PendingApproval | null>(null);
  React.useEffect(() => {
    pendingApprovalRef.current = pendingApproval;
  }, [pendingApproval]);

  const patch = React.useCallback(
    (id: string, fn: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    },
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
    async (userContent: string, sources: string[] = [], context = "") => {
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
      // Guard non-`patch` state updates: a late frame from a superseded or
      // reset turn must not clobber the live one. `patch` is already keyed on
      // `assistantId`, so a late chunk for a dead message no-ops; but
      // setSessionId/approval updates are not, so gate them on this epoch +
      // controller (matching the `finally` teardown's own guard).
      const epoch = epochRef.current;
      const owns = () => epoch === epochRef.current && abortRef.current === controller;

      const onEvent = (ev: ChatEvent) => {
        switch (ev.type) {
          case "chunk":
            // `ev.text` is untrusted wire data; guard the concat so a malformed
            // frame can't append the literal "undefined" into the message.
            patch(assistantId, (m) => ({
              ...m,
              content: m.content + (typeof ev.text === "string" ? ev.text : ""),
            }));
            break;
          case "tool_call_start":
            patch(assistantId, (m) => ({
              ...m,
              toolCalls: [
                ...(m.toolCalls || []),
                {
                  id: ev.id,
                  name: ev.name,
                  args: ev.args,
                  done: false,
                } as ToolCall,
              ],
            }));
            break;
          case "tool_call_end":
            patch(assistantId, (m) => {
              const existing = m.toolCalls || [];
              const matched = existing.some((t) => t.id === ev.id);
              const updated = existing.map((t) =>
                t.id === ev.id
                  ? {
                      ...t,
                      ok: ev.ok,
                      outputPreview: ev.output_preview,
                      done: true,
                    }
                  : t,
              );
              // An end with no matching start (dropped/reordered frame) would
              // otherwise vanish — surface it as a completed chip instead.
              return {
                ...m,
                toolCalls: matched
                  ? updated
                  : [
                      ...updated,
                      {
                        id: ev.id,
                        name: "tool",
                        ok: ev.ok,
                        outputPreview: ev.output_preview,
                        done: true,
                      } as ToolCall,
                    ],
              };
            });
            break;
          case "memory_recalled":
            // Arrives before the first chunk. Guard the shape: an assistant
            // turn claiming memories it did not use is worse than showing none.
            patch(assistantId, (m) => ({
              ...m,
              recalledMemories: Array.isArray(ev.keys)
                ? ev.keys.filter((k): k is string => typeof k === "string")
                : [],
            }));
            break;
          case "usage":
            patch(assistantId, (m) => ({
              ...m,
              usage: { total: ev.total, cost_usd: ev.cost_usd },
            }));
            break;
          case "approval_request":
            // Queue the request; the stream keeps reading (keep-alives) until
            // the user resolves it via `resolveApproval`, after which the
            // gateway emits the tool_call_start/end + remaining events.
            if (owns())
              setApprovalQueue((q) => [
                ...q,
                { id: ev.id, tool: ev.tool, args: ev.args },
              ]);
            break;
          case "approval_resolved":
            // The gateway answered (or expired) this request — drop its modal.
            if (owns())
              setApprovalQueue((q) => q.filter((a) => a.id !== ev.id));
            break;
          case "error":
            // Terminal for the turn — clear pending approvals so a modal can't
            // ghost over the finished/failed conversation.
            if (owns()) setApprovalQueue([]);
            patch(assistantId, (m) => ({ ...m, error: ev.message }));
            break;
          case "done":
            // Capture the session the backend persisted this turn to, so the
            // next message continues the same conversation (multi-turn).
            if (owns() && ev.session_id) setSessionId(ev.session_id);
            // The turn is over — a lingering approval modal (e.g. server-side
            // deadline auto-deny) must not survive into the next turn.
            if (owns()) setApprovalQueue([]);
            patch(assistantId, (m) => ({
              ...m,
              streaming: false,
              cancelled: ev.cancelled || m.cancelled,
              toolCalls: finalizeToolCalls(m.toolCalls, !!(ev.cancelled || m.cancelled)),
              content:
                m.content || (ev.cancelled ? "_(stopped)_" : ev.text || ""),
            }));
            break;
          default:
            break;
        }
      };

      try {
        await streamChat(
          {
            message: userContent,
            model: optsRef.current.model,
            provider: optsRef.current.provider,
            temperature: optsRef.current.temperature,
            // Fall back to the conversation id on the first turn: naming the
            // session up front is what keeps it equal to the KB category the
            // attachments were ingested under.
            session_id: sessionIdRef.current ?? conversationIdRef.current,
            // Retrieved KB context rides its own structured field (framed
            // server-side as reference material), not glued into `message`, so
            // it never enters the persisted transcript or replayed history.
            context: context.trim() ? context : undefined,
            // Same reason, for the same field's sake: the gateway persists
            // `message` verbatim, so the generative-UI instruction used to be
            // stored as part of the user's turn and replayed on every later
            // turn — including after the user switched back to markdown. The
            // gateway owns the instruction now; this only names the mode.
            render_mode:
              optsRef.current.renderMode === "gui" ? "gui" : undefined,
          },
          onEvent,
          controller.signal,
        );
      } catch (err) {
        // streamChat only rejects when it fails BEFORE its own try block — a Stop
        // before the first byte (AbortError) or a network failure reaching the
        // Next route. Finalize the bubble here so it never stays "streaming".
        const aborted = (err as Error)?.name === "AbortError";
        if (owns()) setApprovalQueue([]);
        patch(assistantId, (m) => ({
          ...m,
          streaming: false,
          toolCalls: finalizeToolCalls(m.toolCalls, aborted),
          ...(aborted
            ? { cancelled: true, content: m.content || "_(stopped)_" }
            : {
                error:
                  m.error || String(err instanceof Error ? err.message : err),
              }),
        }));
      } finally {
        // Only the turn that still owns the controller may tear down shared
        // state — a superseded or reset turn must not clobber the live one.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [patch],
  );

  const send = React.useCallback(
    async (text: string, attachments?: string[]) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming || inFlightRef.current) return;
      // Latch synchronously — `isStreaming` doesn't flip until runAssistant, past
      // the `await retrieve()` below, so this is what actually blocks a duplicate.
      inFlightRef.current = true;
      const epoch = epochRef.current;
      try {
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
        // A New-chat / session switch during retrieve() invalidates this turn;
        // bail so its reply isn't stranded in the wrong conversation.
        if (epoch !== epochRef.current) return;
        // KB context is threaded separately (structured field), not folded into
        // the message, so it never enters the persisted transcript.
        await runAssistant(trimmed, sources, context);
      } finally {
        if (epoch === epochRef.current) inFlightRef.current = false;
      }
    },
    [isStreaming, runAssistant, retrieve],
  );

  /** Approve or deny the pending tool call; resumes the paused stream.
   *  `always` (approve only) allowlists the tool for the session; deny cancels the turn. */
  const resolveApproval = React.useCallback(
    async (id: string, approve: boolean, always = false) => {
      const prev = pendingApprovalRef.current;
      const epoch = epochRef.current;
      // Optimistically drop this request from the queue (the next one, if any,
      // becomes the head and its modal shows).
      setApprovalQueue((q) => q.filter((a) => a.id !== id));
      try {
        await api.resolveApproval(id, approve, always);
      } catch {
        // The resolve POST failed (transient blip). Restore the prompt so the user
        // can retry, rather than silently letting the gateway's deadline auto-DENY
        // an intended approve. Only restore while the same turn is still live.
        if (prev && prev.id === id && epoch === epochRef.current && abortRef.current)
          setApprovalQueue((q) => (q.some((a) => a.id === id) ? q : [prev, ...q]));
      }
    },
    [],
  );

  /** Re-run the most recent user turn, replacing the last assistant reply. */
  const regenerate = React.useCallback(async () => {
    if (isStreaming || inFlightRef.current) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    inFlightRef.current = true;
    const epoch = epochRef.current;
    try {
      // Drop everything after the last user message (keyed on the object ref so
      // it's correct even if `prev` differs from this render's snapshot).
      setMessages((prev) => {
        const i = prev.lastIndexOf(lastUser);
        return i === -1 ? prev : prev.slice(0, i + 1);
      });
      const { context, sources } = await retrieve(lastUser.content);
      if (epoch !== epochRef.current) return;
      await runAssistant(lastUser.content, sources, context);
    } finally {
      if (epoch === epochRef.current) inFlightRef.current = false;
    }
  }, [isStreaming, messages, runAssistant, retrieve]);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    // A stopped turn's approval prompt must not linger and resolve the old tool.
    setApprovalQueue([]);
  }, []);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Invalidate any in-flight send/regenerate and release its latch so the new
    // chat can send immediately.
    epochRef.current += 1;
    inFlightRef.current = false;
    setIsStreaming(false);
    setApprovalQueue([]);
    setMessages([]);
    setSessionId(null);
    setConversationId(newConversationId());
  }, []);

  /** Load a past session transcript and continue it (multi-turn when backend supports session_id). */
  const loadHistory = React.useCallback(
    (history: SessionMessage[], id: string | null) => {
      abortRef.current?.abort();
      abortRef.current = null;
      epochRef.current += 1;
      inFlightRef.current = false;
      setIsStreaming(false);
      setApprovalQueue([]);
      setSessionId(id);
      setConversationId(id ?? newConversationId());
      setMessages(
        history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: nextId("h"),
            role: m.role === "user" ? "user" : "assistant",
            // The gateway persists the SENT message, which may carry appended KB
            // context and/or the GUI instruction. Strip both so they never
            // resurface as a user bubble (and so regenerate() re-decorates clean).
            content:
              m.role === "user" ? stripDecorations(m.content) : m.content,
          })),
      );
    },
    [],
  );

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
    return {
      tokens,
      cost,
      toolCalls,
      turns: messages.filter((m) => m.role === "user").length,
    };
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
    pendingApproval,
    resolveApproval,
  };
}
