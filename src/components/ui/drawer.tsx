"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** What first focus and the Tab trap count as focusable inside the sheet. */
const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Right-side sheet with the shared chrome (backdrop, icon tile + eyebrow + title
 * header, close button, Esc/focus-trap/scroll-lock, focus restore). Sits at
 * z-40 so a Modal (z-50) opened on top of it always stacks above
 * deterministically. Named by its title, so AT announces which sheet opened.
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
  const titleId = React.useId();

  // Move focus into the sheet on open and hand it back on close (WCAG 2.4.3).
  // The opener is read before anything inside is focused; without the
  // hand-back every close (Escape, the X, Save) dropped a keyboard user on
  // <body>. A child marked data-autofocus wins, else the first focusable (the
  // X); a parent that wants a field instead focuses it in its own effect,
  // which runs after this one.
  React.useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus();
    };
  }, []);

  // Esc to close, trap Tab focus within the dialog, lock background scroll.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
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
      aria-labelledby={titleId}
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
              {eyebrow && <div className="eyebrow">{eyebrow}</div>}
              <div id={titleId} className="truncate text-sm font-semibold">
                {title}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10 pointer-coarse:min-w-10"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
