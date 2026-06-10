"use client";

import * as React from "react";
import { ChevronDown, Search, RefreshCw, Check } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ModelCatalog } from "@/lib/types";

/**
 * Searchable model combobox. Self-contained: given a `provider`, it fetches the
 * catalog from the gateway (the SAME cache + curated fallback the TUI uses), so
 * the list never drifts from the TUI. Filter by typing; pick from the list; or
 * type any id and "Use …" to set a custom model. Used by the ops Providers panel
 * and the chat composer (`compact`).
 */
export function ModelPicker({
  provider,
  value,
  onChange,
  defaultModel,
  className,
  compact = false,
}: {
  provider: string;
  value: string;
  onChange: (model: string) => void;
  defaultModel?: string;
  className?: string;
  compact?: boolean;
}) {
  const [catalog, setCatalog] = React.useState<ModelCatalog | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!provider) {
      setCatalog(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .providerModels(provider)
      .then((c) => !cancelled && setCatalog(c))
      .catch(() => !cancelled && setCatalog(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [provider]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const models = catalog?.models ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q ? models.filter((m) => m.toLowerCase().includes(q)) : models;
  const showCustom = q.length > 0 && !models.some((m) => m.toLowerCase() === q);

  const pick = (m: string) => {
    onChange(m);
    setOpen(false);
    setQuery("");
  };

  const refresh = async () => {
    if (!provider || refreshing) return;
    setRefreshing(true);
    try {
      setCatalog(await api.refreshProviderModels(provider));
    } catch {
      /* keep current list on failure */
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!provider}
        title={value || defaultModel || "model"}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
          compact ? "h-7 text-[11px]" : "h-9 text-xs",
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || defaultModel || (provider ? "Choose model…" : "Pick a provider first")}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-[min(22rem,82vw)] overflow-hidden rounded-md border border-border bg-background shadow-lg",
            compact ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          <div className="flex items-center gap-1.5 border-b border-border/60 px-2">
            <Search className="size-3.5 opacity-50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  if (filtered[0]) pick(filtered[0]);
                  else if (showCustom) pick(query.trim());
                }
              }}
              placeholder="Search or type a model id…"
              className="h-8 flex-1 bg-transparent font-mono text-xs outline-none"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">Loading models…</div>
            ) : filtered.length === 0 && !showCustom ? (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">
                No models — type an id to use a custom one.
              </div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(m)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left font-mono text-xs hover:bg-muted",
                    m === value && "bg-muted/60",
                  )}
                >
                  <span className="truncate">{m}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {m === defaultModel && (
                      <span className="text-[9px] text-muted-foreground">default</span>
                    )}
                    {m === value && <Check className="size-3.5 text-accent" />}
                  </span>
                </button>
              ))
            )}
            {showCustom && (
              <button
                type="button"
                onClick={() => pick(query.trim())}
                className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                Use <span className="font-mono">&ldquo;{query.trim()}&rdquo;</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
            <span>{catalog ? `${catalog.count} ${catalog.source === "cache" ? "cached" : "suggested"}` : "—"}</span>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-1 hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", refreshing && "animate-spin")} /> refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
