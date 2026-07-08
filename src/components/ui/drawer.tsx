"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right-side sheet with the shared chrome (backdrop, icon tile + eyebrow + title
 * header, close button, Esc/focus-trap/scroll-lock). Sits at z-40 so a Modal
 * (z-50) opened on top of it always stacks above deterministically.
 */
export function Drawer({
  eyebrow,
  title,
  icon,
  onClose,
  className,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  /** Extra classes for the panel, e.g. a width override like `max-w-xl`. */
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Esc to close, trap Tab focus within the dialog, lock background scroll, and
  // move focus into the panel on open (WCAG 2.4.3).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={panelRef}
        className={cn(
          "flex h-full w-full max-w-2xl flex-col border-l border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-right-4",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && (
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {eyebrow}
                </div>
              )}
              <div className="truncate text-sm font-semibold">{title}</div>
            </div>
          </div>
          <button
            autoFocus
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
