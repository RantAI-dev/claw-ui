// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GenerativeMessage } from "./generative-ui";

function ui(comps: unknown): string {
  return "```ui\n" + JSON.stringify(comps) + "\n```";
}

describe("GenerativeMessage defensive rendering", () => {
  it("does not throw when a table's rows are strings, not arrays", () => {
    // Model emits {"type":"table","rows":["a","b"]} — each row is a string, so
    // a bare `row.map` would throw and take down the console route.
    const content = ui([{ type: "table", columns: ["A"], rows: ["a", "b"] }]);
    expect(() =>
      render(<GenerativeMessage content={content} />),
    ).not.toThrow();
  });

  it("does not throw when list/badges items are not an array", () => {
    const content = ui([
      { type: "list", items: "not-an-array" },
      { type: "badges", items: 42 },
    ]);
    expect(() =>
      render(<GenerativeMessage content={content} />),
    ).not.toThrow();
  });

  it("renders deeply-nested cards without overflowing the stack", () => {
    // Build a 30-deep nested card.
    let node: Record<string, unknown> = { type: "text", text: "deep" };
    for (let i = 0; i < 30; i++) node = { type: "card", children: [node] };
    const content = ui([node]);
    expect(() =>
      render(<GenerativeMessage content={content} />),
    ).not.toThrow();
  });
});
