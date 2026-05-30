"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn, formatNumber, formatUsd } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { Markdown } from "./markdown";
import { ToolCallCard } from "./tool-call-card";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const showCursor = message.streaming && !message.content;

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] space-y-1">
        {message.toolCalls?.map((t) => <ToolCallCard key={t.id} tool={t} />)}

        {message.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{message.error}</span>
          </div>
        )}

        {(message.content || showCursor) && (
          <div className="text-sm">
            <Markdown content={message.content} />
            {message.streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse-glow rounded-sm bg-accent align-middle" />
            )}
          </div>
        )}

        {message.usage && !message.streaming && (
          <div className="pt-0.5 text-[10px] text-muted-foreground">
            {formatNumber(message.usage.total)} tokens
            {message.usage.cost_usd > 0 && <> · {formatUsd(message.usage.cost_usd)}</>}
          </div>
        )}
      </div>
    </div>
  );
}
