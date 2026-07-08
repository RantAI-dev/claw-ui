"use client";

import * as React from "react";
import { Loader2, Network, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { KbGraphEdge, KbGraphNode } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "./shared";
import { KnowledgeGraph, entityToken } from "./knowledge-graph";

function entityVar(entityType: string): string {
  return `var(${entityToken(entityType)})`;
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
        <EmptyState
          icon={<Network className="size-6" />}
          title="No entities found"
          hint={
            <>
              No entities are stored for this document. Extraction may not have run yet (enable
              it with <code>KB_INTELLIGENCE_ENABLED</code>), or the document yielded none. Try
              Re-extract.
            </>
          }
        />
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
  return (
    <Drawer
      eyebrow="Document intelligence"
      title={documentTitle}
      icon={<Sparkles className="size-4" />}
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-thin">
        <DocIntelligenceBody documentId={documentId} />
      </div>
    </Drawer>
  );
}
