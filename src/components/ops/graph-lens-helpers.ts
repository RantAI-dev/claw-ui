import type {
  KbCapability,
  KbDocumentIntelligence,
  KbGraph,
  KbGraphEdge,
  KbGraphNode,
} from "@/lib/types";

export type GraphState = "loading" | "disabled" | "no-credential" | "empty" | "ready";

/**
 * Derive the honest render state from the capability signal + scope-wide entity
 * count. `loading` before the first response avoids flashing "empty" on mount.
 */
export function deriveGraphState(
  cap: KbCapability | undefined,
  corpusEntities: number | undefined,
  loading: boolean,
  hasData: boolean,
): GraphState {
  if (loading && !hasData) return "loading";
  if (cap && !cap.intelligence_enabled) return "disabled";
  // Enabled but no key resolves: extraction fails per chunk and is
  // swallowed server-side, so without this distinction the operator sees
  // the same "empty" state as a genuinely entity-free corpus.
  if (cap && cap.intelligence_enabled && cap.credential_configured === false)
    return "no-credential";
  return (corpusEntities ?? 0) === 0 ? "empty" : "ready";
}

/** Heuristic: a small extraction model likely yields a sparse/noisy graph. */
export function isSmallModel(model: string | undefined): boolean {
  return !!model && /(nano|mini|1\.5b|3b|7b|8b)/i.test(model);
}

/**
 * Build a whole-graph shape from one document's intelligence. Degree is computed
 * locally from the relations; `doc_count` is 1; edges carry no `weight` (the
 * renderer falls back to a uniform width). Passes through `capability`.
 */
export function fromIntelligence(intel: KbDocumentIntelligence): KbGraph {
  const degree = new Map<string, number>();
  for (const r of intel.relations) {
    degree.set(r.source, (degree.get(r.source) ?? 0) + 1);
    if (r.target !== r.source) degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
  }
  const nodes: KbGraphNode[] = intel.entities.map((e) => ({
    id: e.id,
    name: e.name,
    entity_type: e.entity_type,
    degree: degree.get(e.id) ?? 0,
    doc_count: 1,
  }));
  const edges: KbGraphEdge[] = intel.relations.map((r) => ({
    source: r.source,
    target: r.target,
    relation_type: r.relation_type,
  }));
  return {
    nodes,
    edges,
    stats: { corpus_entities: intel.entities.length, corpus_relations: intel.relations.length },
    capability: intel.capability,
  };
}
