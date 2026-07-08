"use client";

import * as React from "react";
import { Network, RefreshCw, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { KbGraphEdge, KbGraphNode } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { IconButton, PanelFrame, StatTile } from "./shared";
import { KnowledgeGraph, entityToken } from "./knowledge-graph";

const GRAPH_LIMIT = 200;

function entityVar(entityType: string): string {
  return `var(${entityToken(entityType)})`;
}

export function KbGraphPanel() {
  const groups = useAsync(() => api.kbGroups(), []);
  const [group, setGroup] = React.useState("");
  const graph = useAsync(
    () => api.kbGraph({ limit: GRAPH_LIMIT, group: group || undefined }),
    [group],
  );
  const [selected, setSelected] = React.useState<KbGraphNode | null>(null);

  const nodes = React.useMemo(() => graph.data?.nodes ?? [], [graph.data]);
  const edges = React.useMemo(() => graph.data?.edges ?? [], [graph.data]);

  // Reset the selection whenever the underlying graph changes.
  React.useEffect(() => {
    setSelected(null);
  }, [graph.data]);

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

  const totalNodes = graph.data?.stats?.total_nodes ?? nodes.length;
  const totalEdges = graph.data?.stats?.total_edges ?? edges.length;

  const selectedRelations = React.useMemo(() => {
    if (!selected) return [] as KbGraphEdge[];
    return edges.filter((e) => e.source === selected.id || e.target === selected.id);
  }, [selected, edges]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Network className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              aria-label="Filter by knowledge base"
              className="pl-8 pr-7"
            >
              <option value="">All knowledge bases</option>
              {(groups.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            top {GRAPH_LIMIT} nodes
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => { graph.refresh(); groups.refresh(); }}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="entities" value={formatNumber(totalNodes)} />
        <StatTile label="relations" value={formatNumber(totalEdges)} />
        <StatTile label="entity types" value={formatNumber(typeCounts.length)} />
      </div>

      <PanelFrame loading={graph.loading} error={graph.error} onRefresh={graph.refresh}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Graph + legend */}
          <div className="space-y-3">
            <KnowledgeGraph
              nodes={nodes}
              edges={edges}
              height={520}
              selectedId={selected?.id}
              onSelectNode={(n) => setSelected(n)}
            />
            {typeCounts.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-card/60 px-3 py-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Legend
                </span>
                {typeCounts.map(([type, count]) => (
                  <span key={type} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
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

          {/* Entity detail */}
          <div className="lg:min-h-[520px]">
            {selected ? (
              <EntityDetail
                node={selected}
                relations={selectedRelations}
                nameById={nameById}
                onClose={() => setSelected(null)}
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
      </PanelFrame>
    </div>
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

      <div className="min-h-0 flex-1 border-t border-border/60">
        <div className="px-3 pt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Relationships · {relations.length}
        </div>
        <div className="max-h-[360px] space-y-1.5 overflow-auto p-3 scrollbar-thin">
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

