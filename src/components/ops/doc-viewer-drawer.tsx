"use client";

import * as React from "react";
import { FileText, Network, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { formatNumber, relativeTime } from "@/lib/utils";
import { formatFileSize } from "@/lib/file-type";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocIntelligenceBody } from "./doc-intelligence-drawer";

type ViewerTab = "preview" | "intelligence";

/**
 * Drawer that hosts a document's Preview (full text + metadata) and Intelligence
 * (entities/relations/graph) under two top-level tabs. Replaces the standalone
 * DocIntelligenceDrawer overlay as the per-document viewer.
 */
export function DocViewerDrawer({
  documentId,
  documentTitle,
  initialTab = "preview",
  onClose,
}: {
  documentId: string;
  documentTitle: string;
  initialTab?: ViewerTab;
  onClose: () => void;
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
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={panelRef}
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-right-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Document
              </div>
              <div className="truncate text-sm font-semibold">{documentTitle}</div>
            </div>
          </div>
          <button
            autoFocus
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <Tabs
          defaultValue={initialTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-border/60 px-4 pt-3">
            <TabsList>
              <TabsTrigger value="preview">
                <FileText className="size-3.5" /> Preview
              </TabsTrigger>
              <TabsTrigger value="intelligence">
                <Sparkles className="size-3.5" /> Intelligence
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="preview"
            className="mt-0 min-h-0 flex-1 overflow-auto p-4 scrollbar-thin"
          >
            <DocPreview documentId={documentId} />
          </TabsContent>

          <TabsContent
            value="intelligence"
            className="mt-0 min-h-0 flex-1 overflow-auto p-4 scrollbar-thin"
          >
            <DocIntelligenceBody documentId={documentId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DocPreview({ documentId }: { documentId: string }) {
  const doc = useAsync(() => api.kbGetDocument(documentId), [documentId]);

  if (doc.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (doc.error) {
    return <div className="py-10 text-center text-sm text-destructive">{doc.error}</div>;
  }

  const d = doc.data;
  if (!d) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Document not found.
      </div>
    );
  }

  const meta = [formatFileSize(d.file_size), d.file_type]
    .filter((x) => x && x !== "—")
    .join(" · ");
  const retrievals = d.retrieval_count ?? 0;
  const content = d.content ?? "";

  return (
    <div className="space-y-3">
      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {meta && (
          <span className="font-mono uppercase tracking-wide">{meta}</span>
        )}
        {d.created_at != null && (
          <>
            {meta && <span className="text-muted-foreground/40">·</span>}
            <span>{relativeTime(d.created_at)}</span>
          </>
        )}
        {retrievals > 0 && (
          <Badge variant="accent" className="text-[10px]">
            {formatNumber(retrievals)} retrieval{retrievals === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {/* Category badges */}
      {d.categories && d.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.categories.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px]">
              {c}
            </Badge>
          ))}
        </div>
      )}

      {/* Content */}
      {content.trim().length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <Network className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No text content</p>
            <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">
              This document has no extracted text to preview.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
