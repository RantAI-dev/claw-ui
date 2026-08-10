"use client";

import * as React from "react";
import { Loader2, Network, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { deriveGraphState } from "./graph-lens-helpers";
import { useAsync } from "@/hooks/use-async";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "./shared";
import { entityToken } from "./knowledge-graph";
import { GraphLens } from "./graph-lens";

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
 * (DocViewerDrawer). Renders its own re-extract button at the top-right of the
 * content area.
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

  const reextract = async () => {
    setReextracting(true);
    const t = toast.loading("Re-extracting intelligence…");
    try {
      const r = await api.kbReExtractDocument(documentId);
      if ((r.failed_chunks ?? 0) > 0) {
        // Partial failure: some chunks extracted, some did not — say both.
        toast.warning(
          `Found ${formatNumber(r.entities)} entities · ${formatNumber(r.relations)} relations — ` +
            `${formatNumber(r.failed_chunks ?? 0)} chunks failed${r.error ? ` (${r.error})` : ""}`,
          { id: t },
        );
      } else {
        toast.success(
          `Found ${formatNumber(r.entities)} entities · ${formatNumber(r.relations)} relations in this document`,
          { id: t },
        );
      }
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
          hint={(() => {
            // Same pure function as the graph tab — the two surfaces
            // disagreeing about WHY it is empty is how this started
            // (plan 111 reuses plan 097's deriveGraphState).
            const state = deriveGraphState(intel.data?.capability, 0, false, true);
            if (state === "disabled")
              return (
                <>
                  Intelligence extraction is disabled — enable it with{" "}
                  <code>KB_INTELLIGENCE_ENABLED</code>, or use <em>Re-extract</em>, which works
                  while disabled.
                </>
              );
            if (state === "no-credential")
              return (
                <>
                  Extraction is enabled but no API key resolves for the extraction endpoint, so
                  extraction fails silently. Add a key under Knowledge Base settings (or set{" "}
                  <code>OPENROUTER_API_KEY</code>), then <em>Re-extract</em>.
                </>
              );
            return (
              <>
                No entities are stored for this document — it may genuinely yield none. Try{" "}
                <em>Re-extract</em>.
              </>
            );
          })()}
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
            <GraphLens scope={{ kind: "document", documentId }} lockScope />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
