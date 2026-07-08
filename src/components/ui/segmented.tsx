"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Segmented control — the one toggle-group look (view modes, tab-like switches). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; ariaLabel?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          aria-label={o.ariaLabel}
          title={o.ariaLabel}
          className={cn(
            "cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
