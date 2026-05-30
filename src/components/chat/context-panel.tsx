"use client";

import * as React from "react";
import { X, Activity, Wrench, Coins, Hash, Cpu } from "lucide-react";
import { cn, formatNumber, formatUsd } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

interface Totals {
  tokens: number;
  cost: number;
  toolCalls: number;
  turns: number;
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

export function ContextPanel({
  messages,
  totals,
  sessionId,
  effectiveModel,
  effectiveProvider,
  onClose,
}: {
  messages: ChatMessage[];
  totals: Totals;
  sessionId: string | null;
  effectiveModel: string;
  effectiveProvider: string;
  onClose?: () => void;
}) {
  const toolUsage = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages) for (const t of m.toolCalls || []) counts.set(t.name, (counts.get(t.name) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [messages]);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Activity className="size-4 text-accent" /> Details
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary cursor-pointer"
            title="Hide panel"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4">
        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            This thread
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={Hash} label="Turns" value={formatNumber(totals.turns)} />
            <Stat icon={Coins} label="Tokens" value={formatNumber(totals.tokens)} />
            <Stat icon={Coins} label="Cost" value={formatUsd(totals.cost)} />
            <Stat icon={Wrench} label="Tool calls" value={formatNumber(totals.toolCalls)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Model
          </div>
          <Stat icon={Cpu} label={effectiveProvider || "default provider"} value={effectiveModel || "default model"} />
        </div>

        {sessionId && (
          <div className="space-y-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Session
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="font-mono text-xs text-muted-foreground">{sessionId.slice(0, 18)}…</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">Continuing this conversation</div>
            </div>
          </div>
        )}

        {toolUsage.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tools used
            </div>
            <div className="space-y-1">
              {toolUsage.map(([name, n]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-1.5 text-xs"
                >
                  <span className="flex items-center gap-2 font-mono">
                    <Wrench className="size-3 text-muted-foreground" /> {name}
                  </span>
                  <span className="text-muted-foreground">×{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <p className="px-1 pt-4 text-center text-xs text-muted-foreground">
            Stats for the current conversation will appear here as you chat.
          </p>
        )}
      </div>
    </div>
  );
}
