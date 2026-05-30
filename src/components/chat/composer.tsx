"use client";

import * as React from "react";
import { ArrowUp, Square } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { ProviderInfo } from "@/lib/types";

export interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  providers: ProviderInfo[];
  provider: string;
  onProviderChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  defaultProvider?: string;
  defaultModel?: string;
}

export function Composer({
  onSend,
  onStop,
  isStreaming,
  providers,
  provider,
  onProviderChange,
  model,
  onModelChange,
  defaultProvider,
  defaultModel,
}: ComposerProps) {
  const [text, setText] = React.useState("");
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  React.useEffect(grow, [text, grow]);

  const submit = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text);
    setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring">
          <Textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message the agent…  (Enter to send, Shift+Enter for newline)"
            className="max-h-[220px] border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
            rows={1}
          />
          <div className="flex items-center gap-2 px-3 pb-2.5">
            <select
              value={provider}
              onChange={(e) => onProviderChange(e.target.value)}
              className="h-7 max-w-[140px] rounded-md border border-border bg-background px-2 text-xs text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              title="Provider override"
            >
              <option value="">{defaultProvider ? `${defaultProvider} (default)` : "default provider"}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                  {p.local ? " · local" : ""}
                </option>
              ))}
            </select>
            <input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={defaultModel ? `${defaultModel} (default)` : "model override"}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Model override"
            />
            {isStreaming ? (
              <Button size="icon-sm" variant="destructive" onClick={onStop} title="Stop">
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button size="icon-sm" onClick={submit} disabled={!text.trim()} title="Send">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 px-1 text-center text-[10px] text-muted-foreground">
          v1 sends each message as a fresh turn — the agent does not yet retain earlier turns of
          this thread.
        </p>
      </div>
    </div>
  );
}
