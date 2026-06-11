"use client";

import * as React from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  value: string;
  label: string;
  /** small muted text shown on the right of the row (e.g. "local", "default"). */
  hint?: string;
}

/**
 * Generic searchable combobox — one styled trigger + popover used everywhere so
 * provider and model pickers look identical (no native `<select>` mismatch).
 * `allowCustom` adds a "Use …" row for free-text values; `footer` renders an
 * optional row (e.g. count + refresh).
 */
export function Combobox({
  items,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  disabled = false,
  loading = false,
  compact = false,
  mono = false,
  allowCustom = false,
  footer,
  className,
}: {
  items: ComboboxItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  mono?: boolean;
  allowCustom?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((it) => it.label.toLowerCase().includes(q) || it.value.toLowerCase().includes(q))
    : items;
  const showCustom = allowCustom && q.length > 0 && !items.some((it) => it.value.toLowerCase() === q);

  // Visible label for the current value — fall back to the raw value (custom ids).
  const selectedLabel = items.find((it) => it.value === value)?.label ?? value;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={value ? selectedLabel : placeholder}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer disabled:cursor-default disabled:opacity-50",
          compact && "h-7 text-[11px]",
        )}
      >
        <span className={cn("truncate", mono && "font-mono", !value && "text-muted-foreground")}>
          {value ? selectedLabel : placeholder}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 min-w-full w-[min(22rem,90vw)] overflow-hidden rounded-md border border-border bg-background shadow-lg",
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
                  if (filtered[0]) pick(filtered[0].value);
                  else if (showCustom) pick(query.trim());
                }
              }}
              placeholder={searchPlaceholder}
              className={cn("h-8 flex-1 bg-transparent text-xs outline-none", mono && "font-mono")}
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 && !showCustom ? (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((it) => (
                <button
                  key={it.value}
                  type="button"
                  onClick={() => pick(it.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted",
                    mono && "font-mono",
                    it.value === value && "bg-muted/60",
                  )}
                >
                  <span className="truncate">{it.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {it.hint && <span className="text-[9px] text-muted-foreground">{it.hint}</span>}
                    {it.value === value && <Check className="size-3.5 text-accent" />}
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
                Use <span className={cn(mono && "font-mono")}>&ldquo;{query.trim()}&rdquo;</span>
              </button>
            )}
          </div>

          {footer && (
            <div className="flex items-center justify-between border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
