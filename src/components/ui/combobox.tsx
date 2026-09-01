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
 * Generic searchable combobox: one styled trigger + popover used everywhere so
 * provider and model pickers look identical (no native `<select>` mismatch).
 * `allowCustom` adds a "Use …" row for free-text values; `footer` renders an
 * optional row (e.g. count + refresh). Closing the popover with Escape or a
 * pick puts focus back on the trigger, so a keyboard user continues from the
 * picker instead of from the top of the document.
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
  id,
  ariaLabelledBy,
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
  /** id for the trigger button, so a `<label htmlFor>` can point at it. */
  id?: string;
  /** id of the visible label naming this picker; read on the trigger and the list. */
  ariaLabelledBy?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // Row the arrow keys are on; -1 = none (Enter then takes the first match).
  const [active, setActive] = React.useState(-1);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listId = React.useId();

  // A closed popover forgets its search and highlight.
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(-1);
    }
  }, [open]);

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

  // Visible label for the current value; fall back to the raw value (custom ids).
  const selectedLabel = items.find((it) => it.value === value)?.label ?? value;

  // Escape and a pick close the popover and hand focus back to the trigger; an
  // outside click does not (the pointer already went somewhere else).
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (v: string) => {
    onChange(v);
    setQuery("");
    close(true);
  };

  // Rows in the order they render: matches, then the "Use …" row.
  const rows: { value: string; custom?: boolean }[] = [
    ...filtered.map((it) => ({ value: it.value })),
    ...(showCustom ? [{ value: query.trim(), custom: true }] : []),
  ];
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      close(true);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = active < 0 ? (step > 0 ? 0 : rows.length - 1) : (active + step + rows.length) % rows.length;
      setActive(next);
      document.getElementById(optionId(next))?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = active >= 0 ? rows[active] : rows[0];
      if (row) pick(row.value);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={ariaLabelledBy}
        title={value ? selectedLabel : placeholder}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer disabled:cursor-default disabled:opacity-50",
          compact ? "h-7 text-[11px]" : "pointer-coarse:min-h-11",
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
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(-1);
              }}
              onKeyDown={onInputKey}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              placeholder={searchPlaceholder}
              className={cn("h-8 flex-1 rounded-sm bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-ring", mono && "font-mono")}
            />
          </div>

          <div id={listId} role="listbox" aria-labelledby={ariaLabelledBy} className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 && !showCustom ? (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((it, i) => (
                <button
                  key={it.value}
                  id={optionId(i)}
                  type="button"
                  role="option"
                  aria-selected={it.value === value}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(it.value)}
                  className={cn(
                    "flex min-h-9 w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted pointer-coarse:min-h-11",
                    mono && "font-mono",
                    it.value === value && "bg-muted/60",
                    active === i && "bg-muted",
                  )}
                >
                  <span className="truncate">{it.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {it.hint && <span className="text-[11px] text-muted-foreground">{it.hint}</span>}
                    {it.value === value && <Check className="size-3.5 text-accent" />}
                  </span>
                </button>
              ))
            )}
            {showCustom && (
              <button
                id={optionId(filtered.length)}
                type="button"
                role="option"
                aria-selected={false}
                tabIndex={-1}
                onMouseEnter={() => setActive(filtered.length)}
                onClick={() => pick(query.trim())}
                className={cn(
                  "flex min-h-9 w-full items-center gap-1 px-2 py-1.5 text-left text-xs hover:bg-muted pointer-coarse:min-h-11",
                  active === filtered.length && "bg-muted",
                )}
              >
                Use <span className={cn(mono && "font-mono")}>&ldquo;{query.trim()}&rdquo;</span>
              </button>
            )}
          </div>

          {footer && (
            <div className="flex flex-wrap items-center justify-between gap-y-1 border-t border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
