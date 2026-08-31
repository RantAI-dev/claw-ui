"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Footer slot — typically Cancel / confirm buttons. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** false: no X, and Escape/backdrop do nothing. For dialogs whose only exits
   *  are the footer buttons (a tool approval, where dismiss is not deny). */
  closable?: boolean;
}

/**
 * Minimal accessible modal: fixed overlay + centered card panel. Closes on Esc
 * and backdrop click. No external dialog dependency — plain React + portal.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  className,
  closable = true,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    // Remember what had focus so we can restore it when the dialog closes,
    // and move focus into the dialog so keyboard/AT users start inside it.
    const restoreTo = document.activeElement as HTMLElement | null;
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      // A child marked data-autofocus wins; otherwise the first focusable,
      // which is the X in the header. React's autoFocus prop never reaches the
      // DOM, hence the data attribute.
      const focusable =
        panel.querySelector<HTMLElement>("[data-autofocus]") ??
        panel.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
      (focusable ?? panel).focus();
    };
    focusFirst();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (closable) onClose();
        return;
      }
      // Trap Tab focus within the dialog (aria-modal is advisory; enforce it).
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
        if (items.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !panel.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    // Lock background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // Return focus to the trigger only if it's still in the document.
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus();
    };
  }, [open, onClose, closable]);

  if (!mounted || !open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in-0"
      onMouseDown={(e) => {
        // Only close when the click starts on the backdrop itself.
        if (closable && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[calc(100dvh_-_2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl outline-none animate-in zoom-in-95 fade-in-0",
          className,
        )}
      >
        {closable && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        )}

        {(title || description) && (
          <div className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5 pr-12">
            {title && (
              <h2 id={titleId} className="text-base font-semibold tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        )}

        {children && <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>}

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
