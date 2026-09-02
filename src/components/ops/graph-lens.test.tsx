// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { KbGraph } from "@/lib/types";

const kbGraph = vi.fn();
const kbDocumentIntelligence = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: {
    kbGraph: (...a: unknown[]) => kbGraph(...a),
    kbDocumentIntelligence: (id: string) => kbDocumentIntelligence(id),
  },
}));
// The force canvas is a browser library; the lens is what is under test.
vi.mock("./knowledge-graph", () => ({
  KnowledgeGraph: () => <div data-testid="canvas" />,
  entityToken: (t: string) => `--entity-${t}`,
}));

import { EntityTypeBadge, GraphLens } from "./graph-lens";

function graph(nodeCount: number): KbGraph {
  const types = ["person", "organization", "technology", "concept"];
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    name: i === 0 ? "Platform" : `Entity ${String(i).padStart(2, "0")}`,
    entity_type: types[i % types.length],
    degree: nodeCount - i,
    doc_count: 1,
  }));
  const edges = nodes.slice(1).map((n) => ({
    source: "n0",
    target: n.id,
    relation_type: "works_with",
    weight: 1,
  }));
  return {
    nodes,
    edges,
    stats: { corpus_entities: nodeCount, corpus_relations: edges.length, truncated: false },
    capability: { intelligence_enabled: true, extraction_model: "openai/gpt-4.1-nano", credential_configured: true },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("GraphLens", () => {
  it("lists the busiest entities in the side column; selecting swaps in the detail, Close swaps back", async () => {
    kbGraph.mockResolvedValue(graph(15));
    render(<GraphLens scope={{ kind: "all" }} />);
    const list = await screen.findByRole("list", { name: "Entities by links" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(12);
    expect(buttons[0].textContent).toContain("Platform");
    expect(buttons[0].textContent).toContain("15");
    expect(screen.getByText("and 3 more in the graph")).toBeTruthy();
    fireEvent.click(buttons[0]);
    // The detail replaces the list: its Close button and its relationship count.
    expect(screen.queryByRole("list", { name: "Entities by links" })).toBeNull();
    expect(screen.getByText("Relationships · 14")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("list", { name: "Entities by links" })).toBeTruthy();
  });

  it("keeps the selection across a refresh of the same graph", async () => {
    // Fresh objects per call: a refresh really changes `data`'s identity, which
    // is exactly what used to wipe the selection and close the panel.
    kbGraph.mockImplementation(() => Promise.resolve(graph(15)));
    render(<GraphLens scope={{ kind: "all" }} />);
    const list = await screen.findByRole("list", { name: "Entities by links" });
    fireEvent.click(within(list).getAllByRole("button")[0]);
    expect(screen.getByText("Relationships · 14")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh graph" }));
    await waitFor(() => expect(kbGraph).toHaveBeenCalledTimes(2));
    // The detail stays open for the same entity; the list stays swapped out.
    expect(screen.getByText("Relationships · 14")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Entities by links" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("keeps the three stat tiles in one row on every width", async () => {
    kbGraph.mockResolvedValue(graph(3));
    const { container } = render(<GraphLens scope={{ kind: "all" }} />);
    await screen.findByRole("list", { name: "Entities by links" });
    const tiles = container.querySelector(".grid-cols-3");
    expect(tiles).toBeTruthy();
    expect(tiles!.textContent).toContain("entities");
    expect(screen.queryByText(/more in the graph/)).toBeNull();
  });

  it("tells a keyboard user how to select when nothing is selected", async () => {
    kbGraph.mockResolvedValue(graph(2));
    render(<GraphLens scope={{ kind: "all" }} />);
    await screen.findByRole("list", { name: "Entities by links" });
    expect(
      screen.getByText("Select an entity here or in the graph to see its relationships."),
    ).toBeTruthy();
  });
});

describe("EntityTypeBadge", () => {
  it("puts the tone on a dot and keeps the word in the foreground", () => {
    const { container } = render(<EntityTypeBadge type="person" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.textContent).toBe("person");
    expect(badge.style.color).toBe("");
    expect(badge.style.background).toBe("");
    expect(badge.className).toContain("border-border");
    const dot = badge.querySelector<HTMLElement>("[aria-hidden]")!;
    expect(dot.style.background).toContain("var(--entity-person)");
  });
});
