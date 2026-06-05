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
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in-0"
      onMouseDown={(e) => {
        // Only close when the click starts on the backdrop itself.
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "relative w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-xl animate-in zoom-in-95 fade-in-0",
          className,
        )}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
        >
          <X className="size-4" />
        </button>

        {(title || description) && (
          <div className="border-b border-border/60 px-5 pb-4 pt-5 pr-12">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        )}

        {children && <div className="px-5 py-4">{children}</div>}

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
