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
}

export function useChat(opts: UseChatOptions) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  // Always read the current session id at call time (not closure-captured), so
  // a turn started right after `done` set a new id still continues the session.
  const sessionIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const patch = React.useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  // Core turn runner — appends an assistant message and streams into it.
  const runAssistant = React.useCallback(
    async (userContent: string) => {
      const assistantId = nextId("a");
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        toolCalls: [],
        usage: null,
        error: null,
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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      setMessages((prev) => [...prev, { id: nextId("u"), role: "user", content: trimmed }]);
      await runAssistant(trimmed);
    },
    [isStreaming, runAssistant],
  );

  /** Re-run the most recent user turn, replacing the last assistant reply. */
  const regenerate = React.useCallback(async () => {
    if (isStreaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Drop everything after the last user message (keyed on the object ref so
    // it's correct even if `prev` differs from this render's snapshot).
    setMessages((prev) => {
      const i = prev.lastIndexOf(lastUser);
      return i === -1 ? prev : prev.slice(0, i + 1);
    });
    await runAssistant(lastUser.content);
  }, [isStreaming, messages, runAssistant]);

  const stop = React.useCallback(() => abortRef.current?.abort(), []);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages([]);
    setSessionId(null);
  }, []);

  /** Load a past session transcript and continue it (multi-turn when backend supports session_id). */
  const loadHistory = React.useCallback((history: SessionMessage[], id: string | null) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setSessionId(id);
    setMessages(
      history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: nextId("h"),
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
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

  return { messages, isStreaming, sessionId, send, regenerate, stop, reset, loadHistory, totals };
}
