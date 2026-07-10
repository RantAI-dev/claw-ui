"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { Loader2, Network } from "lucide-react";
import type { KbGraphEdge, KbGraphNode } from "@/lib/types";
import { EmptyState } from "./shared";

// ── Entity-type → design token ──────────────────────────────────────────────
// Each entity colour resolves to a console accent CSS var so the graph stays
// cohesive with the dark ops theme (and re-themes with the rest of the UI).
const ENTITY_TOKEN: Record<string, string> = {
  person: "--brand-sky",
  organization: "--accent-purple",
  location: "--accent-green",
  product: "--accent-orange",
  technology: "--accent-teal",
  concept: "--accent-cornflower",
  event: "--accent-blue",
  date: "--accent-seagreen",
  email: "--accent-red",
  url: "--accent-cornflower",
  phone: "--accent-seagreen",
  money: "--accent-green",
  function: "--accent-blue",
  api: "--accent-teal",
  error: "--accent-red",
  file: "--accent-orange",
};
const FALLBACK_TOKEN = "--muted-foreground";

// Canvas-safe fallbacks (used if getComputedStyle yields nothing or a non-hex
// value the canvas can't paint, e.g. an oklch() token).
const TOKEN_HEX: Record<string, string> = {
  "--brand-sky": "#5eb6fa",
  "--accent-orange": "#bb7851",
  "--accent-blue": "#0d63d0",
  "--accent-green": "#80cb87",
  "--accent-teal": "#388ca1",
  "--accent-seagreen": "#32836a",
  "--accent-purple": "#574399",
  "--accent-red": "#bb5153",
  "--accent-cornflower": "#517fbb",
  "--muted-foreground": "#9aa6ad",
  // Theme surfaces for canvas text/halo (dark-canonical fallbacks; light brands
  // resolve their own hex values via getComputedStyle).
  "--foreground": "#f4f8fb",
  "--background": "#0f1419",
};

/** `#rrggbb` → `rgba(r,g,b,a)`; non-hex values pass through unchanged. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Stable design token for an entity type (lowercased lookup, neutral fallback). */
export function entityToken(entityType: string | null | undefined): string {
  return ENTITY_TOKEN[(entityType || "").toLowerCase()] || FALLBACK_TOKEN;
}

/** Node radius scales with degree: 4 + sqrt(degree) * 2. */
export function nodeRadius(degree: number): number {
  return 4 + Math.sqrt(Math.max(0, degree || 0)) * 2;
}

function resolveToken(token: string): string {
  if (typeof window !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    // Canvas fillStyle is reliable with hex/rgb; skip oklch() and friends.
    if (v && (v.startsWith("#") || v.startsWith("rgb"))) return v;
  }
  return TOKEN_HEX[token] ?? "#9aa6ad";
}

// ── react-force-graph-2d is canvas/window-only → client-only dynamic import ──
type RTNode = KbGraphNode & { x?: number; y?: number; __adj?: boolean };
type RTLink = {
  source: string | RTNode;
  target: string | RTNode;
  relation_type: string;
  weight?: number;
};

interface ForceGraph2DProps {
  graphData: { nodes: RTNode[]; links: RTLink[] };
  width?: number;
  height?: number;
  backgroundColor?: string;
  nodeRelSize?: number;
  nodeVal?: (n: RTNode) => number;
  nodeLabel?: (n: RTNode) => string;
  nodeColor?: (n: RTNode) => string;
  nodeCanvasObject?: (n: RTNode, ctx: CanvasRenderingContext2D, scale: number) => void;
  nodePointerAreaPaint?: (
    n: RTNode,
    color: string,
    ctx: CanvasRenderingContext2D,
    scale: number,
  ) => void;
  linkColor?: (l: RTLink) => string;
  linkWidth?: (l: RTLink) => number;
  linkLabel?: (l: RTLink) => string;
  linkCurvature?: number;
  linkDirectionalArrowLength?: number;
  linkDirectionalArrowRelPos?: number;
  linkDirectionalArrowColor?: (l: RTLink) => string;
  cooldownTicks?: number;
  warmupTicks?: number;
  d3VelocityDecay?: number;
  minZoom?: number;
  maxZoom?: number;
  enableNodeDrag?: boolean;
  onNodeClick?: (n: RTNode) => void;
  onEngineStop?: () => void;
}

/** Imperative handle exposed by react-force-graph-2d (only the bits we use). */
type FgHandle = {
  zoomToFit?: (durationMs?: number, padding?: number) => void;
  d3Force?: (name: string) => { distanceMax?: (n: number) => void } | undefined;
};

// react-force-graph-2d is a forwardRef component; Next 16 / React 19 forwards a
// `ref` through next/dynamic to it, exposing the imperative handle (zoomToFit…).
const ForceGraph2D = dynamic(
  async () => {
    const mod = await import("react-force-graph-2d");
    return mod.default as unknown as ComponentType<
      ForceGraph2DProps & { ref?: React.Ref<FgHandle> }
    >;
  },
  { ssr: false, loading: () => <GraphLoading /> },
);

function GraphLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Rendering graph…
    </div>
  );
}

const endId = (end: string | RTNode): string =>
  typeof end === "object" && end !== null ? end.id : (end as string);

export interface KnowledgeGraphProps {
  nodes: KbGraphNode[];
  edges: KbGraphEdge[];
  height?: number;
  onSelectNode?: (node: KbGraphNode) => void;
  selectedId?: string;
}

export function KnowledgeGraph({
  nodes,
  edges,
  height = 480,
  onSelectNode,
  selectedId,
}: KnowledgeGraphProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const fgRef = React.useRef<FgHandle | null>(null);
  const fittedRef = React.useRef(false);
  const [width, setWidth] = React.useState(0);

  // Track container width so the canvas fills its frame responsively.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(0, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Resolve accent tokens → hex once (re-resolves when the node set changes).
  const colorMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    const tokens = new Set<string>([
      FALLBACK_TOKEN,
      "--foreground",
      "--background",
      "--brand-sky",
      ...Object.values(ENTITY_TOKEN),
    ]);
    tokens.forEach((t) => (m[t] = resolveToken(t)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const colorFor = React.useCallback(
    (entityType: string) => colorMap[entityToken(entityType)] || colorMap[FALLBACK_TOKEN],
    [colorMap],
  );

  // Re-fit the view the next time the engine settles whenever the data changes.
  React.useEffect(() => {
    fittedRef.current = false;
  }, [nodes, edges]);

  // Bound the charge force so disconnected / low-degree nodes don't drift to the
  // far edges — keeps the layout compact so zoomToFit frames it tightly.
  React.useEffect(() => {
    fgRef.current?.d3Force?.("charge")?.distanceMax?.(240);
  }, [width, nodes]);

  // Backstop: onEngineStop can fire before node positions stabilise (leaving the
  // graph clustered off-centre), so also fit on a short timer ladder after mount.
  React.useEffect(() => {
    if (width <= 0 || nodes.length === 0) return;
    const fit = () => fgRef.current?.zoomToFit?.(400, 64);
    const timers = [600, 1400, 2400].map((ms) => setTimeout(fit, ms));
    return () => timers.forEach(clearTimeout);
  }, [width, nodes, edges]);

  // Fresh, plain copies the force engine can mutate; drop dangling edges.
  const graphData = React.useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return {
      nodes: nodes.map((n): RTNode => ({ ...n })),
      links: edges
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .map((e) => ({
          source: e.source,
          target: e.target,
          relation_type: e.relation_type,
          weight: e.weight,
        })),
    };
  }, [nodes, edges]);

  const touchesSelected = React.useCallback(
    (l: RTLink) => !!selectedId && (endId(l.source) === selectedId || endId(l.target) === selectedId),
    [selectedId],
  );

  const drawNode = React.useCallback(
    (node: RTNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = nodeRadius(node.degree);
      const color = colorFor(node.entity_type);
      const selected = node.id === selectedId;
      const dimmed = !!selectedId && !selected && !node.__adj;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.shadowColor = color;
      ctx.shadowBlur = selected ? 22 : 8;
      ctx.globalAlpha = dimmed ? 0.3 : selected ? 1 : 0.92;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      if (selected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6 / scale;
        ctx.stroke();
      }

      // Labels: hubs + selected always; everyone else once zoomed in.
      const show = selected || node.degree >= 5 || scale > 1.3;
      if (show && node.name) {
        const fontSize = Math.max(10 / scale, 3);
        const fg = colorMap["--foreground"];
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.shadowColor = withAlpha(colorMap["--background"], 0.65);
        ctx.shadowBlur = 3;
        ctx.fillStyle = selected ? fg : withAlpha(fg, dimmed ? 0.35 : 0.85);
        ctx.fillText(node.name, x + r + 2.5, y);
        ctx.shadowBlur = 0;
      }
    },
    [colorFor, colorMap, selectedId],
  );

  const paintPointer = React.useCallback(
    (node: RTNode, color: string, ctx: CanvasRenderingContext2D) => {
      const r = nodeRadius(node.degree) + 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fill();
    },
    [],
  );

  // Pre-compute adjacency to the selected node so we can dim the rest.
  React.useEffect(() => {
    const adj = new Set<string>();
    if (selectedId) {
      for (const e of edges) {
        if (e.source === selectedId) adj.add(e.target);
        if (e.target === selectedId) adj.add(e.source);
      }
    }
    for (const n of graphData.nodes) n.__adj = adj.has(n.id);
  }, [selectedId, edges, graphData]);

  if (nodes.length === 0) {
    return (
      <div
        ref={wrapRef}
        className="flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20"
        style={{ height }}
      >
        <EmptyState
          className="py-0"
          icon={<Network className="size-6" />}
          title="No graph to show"
          hint={
            <>
              No entities have been extracted yet. Intelligence extraction may be disabled
              (<code>KB_INTELLIGENCE_ENABLED</code>) or not yet run for these documents.
            </>
          }
        />
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-xl border border-border"
      style={{
        height,
        background:
          "radial-gradient(120% 120% at 50% 0%, color-mix(in oklab, var(--brand-sky) 7%, var(--card)) 0%, var(--card) 60%)",
      }}
    >
      {width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={4}
          nodeVal={(n) => 1 + Math.sqrt(Math.max(0, n.degree || 0))}
          nodeLabel={(n) => `${n.name} · ${n.entity_type}`}
          nodeColor={(n) => colorFor(n.entity_type)}
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={paintPointer}
          linkColor={(l) =>
            touchesSelected(l)
              ? withAlpha(colorMap["--brand-sky"], 0.55)
              : withAlpha(colorMap[FALLBACK_TOKEN], 0.16)
          }
          linkWidth={(l) =>
            // Non-selected width scales with weight but stays below the selected
            // width (1.7) so selection emphasis is never inverted.
            touchesSelected(l) ? 1.7 : 0.4 + Math.min(1, Math.log2(1 + (l.weight ?? 1)) / 3)
          }
          linkLabel={(l) => l.relation_type}
          linkCurvature={0.06}
          linkDirectionalArrowLength={3.4}
          linkDirectionalArrowRelPos={0.92}
          linkDirectionalArrowColor={(l) =>
            touchesSelected(l)
              ? withAlpha(colorMap["--brand-sky"], 0.7)
              : withAlpha(colorMap[FALLBACK_TOKEN], 0.3)
          }
          cooldownTicks={120}
          warmupTicks={8}
          d3VelocityDecay={0.3}
          minZoom={0.3}
          maxZoom={8}
          enableNodeDrag
          onNodeClick={(n) => onSelectNode?.(n)}
          onEngineStop={() => {
            if (!fittedRef.current) {
              fgRef.current?.zoomToFit?.(420, 64);
              fittedRef.current = true;
            }
          }}
        />
      )}
    </div>
  );
}
