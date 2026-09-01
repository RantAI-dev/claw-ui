"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  /** Prefix for the tab / panel ids that tie a trigger to its panel. */
  id: string;
}
const Ctx = React.createContext<TabsCtx | null>(null);

export function Tabs({
  value,
  onValueChange,
  defaultValue,
  className,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  defaultValue?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const id = React.useId();
  const current = value ?? internal;
  const setValue = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
  };
  return (
    <Ctx.Provider value={{ value: current, setValue, id }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({
  className,
  children,
  ...rest
}: { className?: string; children: React.ReactNode } & Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children" | "className"
>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-secondary/60 p-1 text-muted-foreground overflow-x-auto scrollbar-thin",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

const TAB_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * A real tab: `role="tab"`, `aria-selected`, roving `tabIndex` (only the active
 * tab is in the Tab order) and arrow keys that move and activate. Without
 * these the triggers were plain buttons: no state for AT, every tab a Tab stop,
 * and the browser's default outline instead of the console's ring.
 */
export function TabsTrigger({
  value,
  className,
  children,
  onKeyDown,
  ...rest
}: { value: string; className?: string; children: React.ReactNode } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "children" | "className" | "role" | "type"
>) {
  const ctx = React.useContext(Ctx)!;
  const active = ctx.value === value;
  const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const list = e.currentTarget.closest('[role="tablist"]');
    if (!list) return;
    const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
    const i = tabs.indexOf(e.currentTarget);
    if (i < 0) return;
    let next: number | null = null;
    if (e.key in TAB_STEP) next = (i + TAB_STEP[e.key] + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  };
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.id}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${ctx.id}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      onKeyDown={handleKey}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10",
        active
          ? "bg-background text-foreground shadow-sm"
          : "hover:text-foreground hover:bg-background/50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(Ctx)!;
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.id}-panel-${value}`}
      aria-labelledby={`${ctx.id}-tab-${value}`}
      className={cn("mt-4", className)}
    >
      {children}
    </div>
  );
}
