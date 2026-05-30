"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { Composer, type ComposerProps } from "./composer";
import type { ChatMessage } from "@/lib/types";

const SUGGESTIONS = [
  "What can you help me with?",
  "Summarize my recent activity",
  "List the tools you have access to",
  "Run a quick health check",
];

export interface ChatViewProps extends Omit<ComposerProps, "onSend" | "onStop" | "isStreaming"> {
  messages: ChatMessage[];
  isStreaming: boolean;
  readOnlyNotice?: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function ChatView({ messages, isStreaming, readOnlyNotice, onSend, onStop, ...composer }: ChatViewProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottomRef = React.useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary">
              <Sparkles className="size-6 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">How can I help?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a conversation with your RantaiClaw agent.
              </p>
            </div>
            <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            {readOnlyNotice && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-center text-xs text-warning">
                {readOnlyNotice}
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <Composer {...composer} onSend={onSend} onStop={onStop} isStreaming={isStreaming} />
    </div>
  );
}
