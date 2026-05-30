"use client";

import * as React from "react";
import { ChevronRight, Wrench, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/lib/types";

function argsPreview(args: unknown): string {
  if (args == null) return "";
  if (typeof args === "string") return args;
  try {
    const s = JSON.stringify(args);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return String(args);
  }
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = React.useState(false);
  const running = !tool.done;
  const failed = tool.done && tool.ok === false;

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-lg border text-xs",
        failed ? "border-destructive/40 bg-destructive/5" : "border-border bg-secondary/40",
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left cursor-pointer"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono font-medium">{tool.name}</span>
        <span className="truncate text-muted-foreground">{argsPreview(tool.args)}</span>
        <span className="ml-auto shrink-0">
          {running ? (
            <Loader2 className="size-3.5 animate-spin text-warning" />
          ) : failed ? (
            <X className="size-3.5 text-destructive" />
          ) : (
            <Check className="size-3.5 text-success" />
          )}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {tool.args != null && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Arguments
              </div>
              <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] scrollbar-thin">
                {typeof tool.args === "string" ? tool.args : JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}
          {tool.outputPreview && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Result
              </div>
              <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] scrollbar-thin whitespace-pre-wrap">
                {tool.outputPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
