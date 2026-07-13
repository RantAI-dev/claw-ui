"use client";

import * as React from "react";
import { Network, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAsyncGuarded } from "@/hooks/use-async-guarded";
import type { KbGraphEdge, KbGraphNode } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, IconButton, PanelFrame, StatTile } from "./shared";
import { KnowledgeGraph, entityToken } from "./knowledge-graph";
import { deriveGraphState, fromIntelligence, isSmallModel } from "./graph-lens-helpers";

const GRAPH_LIMIT = 200;
const GRAPH_HEIGHT = 480;

/** A knowledge graph can be scoped to one document, one knowledge base (group), or the whole corpus. */
export type GraphScope =
  | { kind: "document"; documentId: string }
  | { kind: "group"; groupId: string }
  | { kind: "all" };

function entityVar(entityType: string): string {
  return `var(${entityToken(entityType)})`;
}

/**
 * Label for the "narrow" side of the scope toggle, or `null` when the lens was
 * opened already at corpus scope (nothing concrete to narrow back to, so no
 * toggle is shown).
 */
function narrowScopeLabel(scope: GraphScope): string | null {
  if (scope.kind === "document") return "This document";
  if (scope.kind === "group") return "This knowledge base";
  return null;
}

/**
 * Scope-toggled knowledge graph: one document's extracted entities, one
 * knowledge base's graph, or the whole corpus. Renders the canvas, the
 * selected-node detail panel, the entity-type legend, and corpus stat tiles.
 */
export function GraphLens({ scope, lockScope }: { scope: GraphScope; lockScope?: boolean }) {
  // The concrete scope this lens was opened with — fixed for its lifetime so the
  // toggle can always jump back to "this document"/"this knowledge base".
  const [narrowScope] = React.useState(scope);
  const [activeScope, setActiveScope] = React.useState<GraphScope>(scope);
  const [selectedNode, setSelectedNode] = React.useState<KbGraphNode | null>(null);

  const documentId = activeScope.kind === "document" ? activeScope.documentId : undefined;
  const groupId = activeScope.kind === "group" ? activeScope.groupId : undefined;

  const { data, error, loading, refresh } = useAsyncGuarded(() => {
    if (activeScope.kind === "document") {
      return api.kbDocumentIntelligence(activeScope.documentId).then(fromIntelligence);
    }
    return api.kbGraph({
      group: activeScope.kind === "group" ? activeScope.groupId : undefined,
      limit: GRAPH_LIMIT,
    });
  }, [activeScope.kind, documentId, groupId]);

  // Reset the selection whenever the underlying graph changes (new scope/data).
  React.useEffect(() => {
    setSelectedNode(null);
  }, [data]);

  const nodes = React.useMemo(() => data?.nodes ?? [], [data]);
  const edges = React.useMemo(() => data?.edges ?? [], [data]);

  const nameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.name);
    return m;
  }, [nodes]);

  // Distinct entity types present, ranked by frequency — drives the legend.
  const typeCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) counts.set(n.entity_type, (counts.get(n.entity_type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const selectedRelations = React.useMemo(() => {
    if (!selectedNode) return [] as KbGraphEdge[];
    return edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id);
  }, [selectedNode, edges]);

  const totalEntities = data?.stats?.corpus_entities ?? nodes.length;
  const totalRelations = data?.stats?.corpus_relations ?? edges.length;

  // Fall back to the returned node count when the backend predates `corpus_entities`
  // — otherwise a populated group/all graph would render as "empty" (graceful
  // degradation: the frontend may ship before the backend field).
  const graphState = deriveGraphState(
    data?.capability,
    data?.stats?.corpus_entities ?? nodes.length,
    loading,
    !!data,
  );

  const narrowLabel = narrowScopeLabel(narrowScope);
  const toggleValue: "narrow" | "all" = activeScope.kind === "all" ? "all" : "narrow";

  return (
    <div className="space-y-4">
      {/* Inside a single-document view the corpus jump is disorienting, so the
          host can lock the lens to the scope it was opened at. */}
      {!lockScope && narrowLabel && (
        <Segmented
          value={toggleValue}
          onChange={(v) => setActiveScope(v === "all" ? { kind: "all" } : narrowScope)}
          options={[
            { value: "narrow", label: narrowLabel },
            { value: "all", label: "All knowledge bases" },
          ]}
        />
      )}

      {/* Stats — only once the graph is actually populated, so they don't read
          "0 / 0 / 0" over the loading, error, disabled, or empty states. */}
      {graphState === "ready" && !error && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="entities"
            value={formatNumber(totalEntities)}
            hint={
              data?.stats?.truncated
                ? `showing ${formatNumber(nodes.length)} of ${formatNumber(totalEntities)}`
                : undefined
            }
          />
          <StatTile label="relations" value={formatNumber(totalRelations)} />
          <StatTile label="entity types" value={formatNumber(typeCounts.length)} />
        </div>
      )}

      <PanelFrame loading={graphState === "loading"} error={error} onRefresh={refresh}>
        {graphState === "disabled" ? (
          <EmptyState
            icon={<Network className="size-6" />}
            title="Intelligence extraction is disabled"
            hint={
              <>
                Set <code>KB_INTELLIGENCE_ENABLED</code> to extract entities and relations across
                your knowledge bases — a document&apos;s <em>Re-extract</em> also works while
                disabled.
                {data?.capability?.extraction_model && (
                  <ModelNote model={data.capability.extraction_model} />
                )}
              </>
            }
          />
        ) : graphState === "empty" ? (
          <EmptyState
            icon={<Network className="size-6" />}
            title="No graph yet"
            hint={
              <>
                No entities have been extracted for this scope yet — try a document&apos;s{" "}
                <em>Re-extract</em>.
                {data?.capability?.extraction_model && (
                  <ModelNote model={data.capability.extraction_model} />
                )}
              </>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* Graph + legend */}
            <div className="space-y-3">
              <KnowledgeGraph
                nodes={nodes}
                edges={edges}
                height={GRAPH_HEIGHT}
                selectedId={selectedNode?.id}
                onSelectNode={(n) => setSelectedNode(n)}
              />
              {typeCounts.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-card/60 px-3 py-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Legend
                  </span>
                  {typeCounts.map(([type, count]) => (
                    <span
                      key={type}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: entityVar(type) }}
                        aria-hidden
                      />
                      <span className="capitalize text-foreground/80">{type}</span>
                      <span className="text-muted-foreground/60">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Entity detail — grid stretch keeps this column at the graph row's height. */}
            <div>
              {selectedNode ? (
                <EntityDetail
                  node={selectedNode}
                  relations={selectedRelations}
                  nameById={nameById}
                  onClose={() => setSelectedNode(null)}
                />
              ) : (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center">
                  <Network className="size-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Click a node to inspect an entity and its relationships.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </PanelFrame>
    </div>
  );
}

/** Surfaces the extraction model with a subtle quality note when it's small. */
function ModelNote({ model }: { model: string }) {
  return (
    <span className="mt-2 block text-[11px] text-muted-foreground">
      Extraction model: <code>{model}</code>
      {isSmallModel(model) && " — small; the extracted graph may be sparse or noisy."}
    </span>
  );
}

function EntityDetail({
  node,
  relations,
  nameById,
  onClose,
}: {
  node: KbGraphNode;
  relations: KbGraphEdge[];
  nameById: Map<string, string>;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card shadow-sm animate-in fade-in-0 slide-in-from-right-2">
      <div className="flex items-start justify-between gap-2 border-b border-border/60 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="mt-1 inline-block size-3 shrink-0 rounded-full"
            style={{ background: entityVar(node.entity_type) }}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{node.name}</div>
            <Badge
              className="mt-1 text-[10px] capitalize"
              style={{
                background: `color-mix(in oklab, ${entityVar(node.entity_type)} 18%, transparent)`,
                color: entityVar(node.entity_type),
                borderColor: "transparent",
              }}
            >
              {node.entity_type}
            </Badge>
          </div>
        </div>
        <IconButton onClick={onClose} aria-label="Close" className="shrink-0">
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        <StatTile size="sm" label="degree" value={node.degree} />
        <StatTile size="sm" label="documents" value={node.doc_count} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-border/60">
        <div className="px-3 pt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Relationships · {relations.length}
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-3 scrollbar-thin">
          {relations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No relationships recorded.</p>
          ) : (
            relations.map((r, i) => {
              const outgoing = r.source === node.id;
              const otherId = outgoing ? r.target : r.source;
              const otherName = nameById.get(otherId) ?? otherId;
              return (
                <div
                  key={`${r.source}-${r.target}-${r.relation_type}-${i}`}
                  className="rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">
                      {outgoing ? node.name : otherName}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-mono text-accent">{r.relation_type}</span>
                    <span aria-hidden>→</span>
                    <span className="truncate">{outgoing ? otherName : node.name}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
