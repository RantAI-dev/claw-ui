"use client";

import * as React from "react";
import { Loader2, Network, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { KbGraphEdge, KbGraphNode } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeGraph, entityToken } from "./knowledge-graph";

function entityVar(entityType: string): string {
  return `var(${entityToken(entityType)})`;
}

function pct(confidence: number | null | undefined): string {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "—";
  const v = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(v)}%`;
}

function EntityTypeBadge({ type }: { type: string }) {
  return (
    <Badge
      className="text-[10px] capitalize"
      style={{
        background: `color-mix(in oklab, ${entityVar(type)} 18%, transparent)`,
        color: entityVar(type),
        borderColor: "transparent",
      }}
    >
      {type}
    </Badge>
  );
}

/**
 * The intelligence content (re-extract + entities/relations/graph) for a single
 * document, decoupled from any drawer chrome so it can be hosted inside a tab
 * (DocViewerDrawer) as well as inside the standalone DocIntelligenceDrawer.
 * Renders its own re-extract button at the top-right of the content area.
 */
export function DocIntelligenceBody({ documentId }: { documentId: string }) {
  const intel = useAsync(() => api.kbDocumentIntelligence(documentId), [documentId]);
  const [reextracting, setReextracting] = React.useState(false);

  const entities = intel.data?.entities ?? [];
  const relations = intel.data?.relations ?? [];

  const nameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entities) m.set(e.id, e.name);
    return m;
  }, [entities]);

  // Build a compact graph from this document's entities + relations.
  const graphNodes: KbGraphNode[] = React.useMemo(() => {
    const degree = new Map<string, number>();
    for (const r of relations) {
      degree.set(r.source, (degree.get(r.source) ?? 0) + 1);
      degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
    }
    return entities.map((e) => ({
      id: e.id,
      name: e.name,
      entity_type: e.entity_type,
      degree: degree.get(e.id) ?? 0,
      doc_count: 1,
    }));
  }, [entities, relations]);

  const graphEdges: KbGraphEdge[] = React.useMemo(
    () => relations.map((r) => ({ source: r.source, target: r.target, relation_type: r.relation_type })),
    [relations],
  );

  const reextract = async () => {
    setReextracting(true);
    const t = toast.loading("Re-extracting intelligence…");
    try {
      const r = await api.kbReExtractDocument(documentId);
      toast.success(
        `Extracted ${formatNumber(r.entities)} entities · ${formatNumber(r.relations)} relations`,
        { id: t },
      );
      intel.refresh();
    } catch (e) {
      toast.error(`Re-extract failed: ${e instanceof Error ? e.message : String(e)}`, { id: t });
    } finally {
      setReextracting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={reextract} disabled={reextracting || intel.loading}>
          {reextracting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Re-extract
        </Button>
      </div>

      {intel.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : intel.error ? (
        <div className="py-10 text-center text-sm text-destructive">{intel.error}</div>
      ) : entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <Network className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No entities found</p>
            <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">
              No entities are stored for this document. Extraction may not have run yet (enable it
              with <code>KB_INTELLIGENCE_ENABLED</code>), or the document yielded none. Try
              Re-extract.
            </p>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="entities">
          <TabsList>
            <TabsTrigger value="entities">Entities · {entities.length}</TabsTrigger>
            <TabsTrigger value="relations">Relations · {relations.length}</TabsTrigger>
            <TabsTrigger value="graph">
              <Network className="size-3.5" /> Graph
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entities">
            <div className="space-y-1.5">
              {entities.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                  <EntityTypeBadge type={e.entity_type} />
                  <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                    {pct(e.confidence)}
                  </Badge>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="relations">
            {relations.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No relations extracted.
              </p>
            ) : (
              <div className="space-y-1.5">
                {relations.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-border/60 bg-background/50 px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{nameById.get(r.source) ?? r.source}</span>
                      <span className="font-mono text-accent">{r.relation_type}</span>
                      <span aria-hidden className="text-muted-foreground">→</span>
                      <span className="font-medium">{nameById.get(r.target) ?? r.target}</span>
                      <Badge variant="secondary" className="ml-auto shrink-0 font-mono text-[10px]">
                        {pct(r.confidence)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="graph">
            <KnowledgeGraph nodes={graphNodes} edges={graphEdges} height={380} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export function DocIntelligenceDrawer({
  documentId,
  documentTitle,
  onClose,
}: {
  documentId: string;
  documentTitle: string;
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
        className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-right-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Document intelligence
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
        <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-thin">
          <DocIntelligenceBody documentId={documentId} />
        </div>
      </div>
    </div>
  );
}
