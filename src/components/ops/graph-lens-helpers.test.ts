import { describe, it, expect } from "vitest";
import { deriveGraphState, isSmallModel, fromIntelligence } from "./graph-lens-helpers";
import type { KbCapability, KbDocumentIntelligence } from "@/lib/types";

const on: KbCapability = { intelligence_enabled: true, extraction_model: "x" };
const off: KbCapability = { intelligence_enabled: false, extraction_model: "x" };

describe("deriveGraphState", () => {
  it("loading before first data", () =>
    expect(deriveGraphState(undefined, undefined, true, false)).toBe("loading"));
  it("disabled when capability is off", () =>
    expect(deriveGraphState(off, 0, false, true)).toBe("disabled"));
  it("empty when enabled with 0 entities", () =>
    expect(deriveGraphState(on, 0, false, true)).toBe("empty"));
  it("ready when entities present", () =>
    expect(deriveGraphState(on, 5, false, true)).toBe("ready"));
});

describe("isSmallModel", () => {
  it("flags nano/mini, not large models", () => {
    expect(isSmallModel("openai/gpt-4.1-nano")).toBe(true);
    expect(isSmallModel("openai/gpt-4o")).toBe(false);
    expect(isSmallModel(undefined)).toBe(false);
  });
});

describe("fromIntelligence", () => {
  it("builds nodes/edges and computes degree from relations", () => {
    const intel: KbDocumentIntelligence = {
      entities: [
        { id: "a", name: "A", entity_type: "person", confidence: 1 },
        { id: "b", name: "B", entity_type: "person", confidence: 1 },
      ],
      relations: [{ id: "r", source: "a", target: "b", relation_type: "knows", confidence: 1 }],
      stats: {},
    };
    const g = fromIntelligence(intel);
    expect(g.nodes.length).toBe(2);
    expect(g.edges.length).toBe(1);
    expect(g.nodes.find((n) => n.id === "a")!.degree).toBe(1);
    expect(g.stats?.corpus_entities).toBe(2);
  });
});
