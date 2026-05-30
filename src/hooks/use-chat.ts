"use client";

import * as React from "react";
import { streamChat } from "@/lib/chat-stream";
import type { ChatMessage, SessionMessage, ToolCall } from "@/lib/types";

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
  const abortRef = React.useRef<AbortController | null>(null);
  const optsRef = React.useRef(opts);
  optsRef.current = opts;

  const patchAssistant = React.useCallback(
    (id: string, fn: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    },
    [],
  );

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMsg: ChatMessage = { id: nextId("u"), role: "user", content: trimmed };
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
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      await streamChat(
        {
          message: trimmed,
          model: optsRef.current.model,
          provider: optsRef.current.provider,
          temperature: optsRef.current.temperature,
        },
        (ev) => {
          switch (ev.type) {
            case "chunk":
              patchAssistant(assistantId, (m) => ({ ...m, content: m.content + ev.text }));
              break;
            case "tool_call_start":
              patchAssistant(assistantId, (m) => ({
                ...m,
                toolCalls: [
                  ...(m.toolCalls || []),
                  { id: ev.id, name: ev.name, args: ev.args, done: false } as ToolCall,
                ],
              }));
              break;
            case "tool_call_end":
              patchAssistant(assistantId, (m) => ({
                ...m,
                toolCalls: (m.toolCalls || []).map((t) =>
                  t.id === ev.id
                    ? { ...t, ok: ev.ok, outputPreview: ev.output_preview, done: true }
                    : t,
                ),
              }));
              break;
            case "usage":
              patchAssistant(assistantId, (m) => ({
                ...m,
                usage: { total: ev.total, cost_usd: ev.cost_usd },
              }));
              break;
            case "error":
              patchAssistant(assistantId, (m) => ({ ...m, error: ev.message }));
              break;
            case "done":
              patchAssistant(assistantId, (m) => ({
                ...m,
                streaming: false,
                content:
                  m.content || (ev.cancelled ? "_(stopped)_" : ev.text || (m.error ? "" : "")),
              }));
              break;
            default:
              break;
          }
        },
        controller.signal,
      );

      setIsStreaming(false);
      abortRef.current = null;
    },
    [isStreaming, patchAssistant],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages([]);
  }, []);

  /** Load a past session transcript (read-only history). */
  const loadHistory = React.useCallback((history: SessionMessage[]) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
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

  return { messages, isStreaming, send, stop, reset, loadHistory };
}
