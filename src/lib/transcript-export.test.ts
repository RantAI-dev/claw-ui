import { describe, it, expect } from "vitest";
import { toMarkdown, toJson } from "./transcript-export";
import type { SessionDetail } from "./types";

const detail: SessionDetail = {
  id: "s1",
  title: "Trip planning",
  model: "gpt",
  started_at: 0,
  messages: [
    { role: "user", content: "Where to?", timestamp: 0 },
    { role: "assistant", content: "Kyoto.", timestamp: 1 },
  ],
};

describe("transcript-export", () => {
  it("renders the title and both roles as Markdown", () => {
    const md = toMarkdown(detail);
    expect(md).toContain("# Trip planning");
    expect(md).toContain("**User:**");
    expect(md).toContain("Where to?");
    expect(md).toContain("**Assistant:**");
    expect(md).toContain("Kyoto.");
  });

  it("falls back to a placeholder title when none is set", () => {
    const md = toMarkdown({ ...detail, title: null });
    expect(md).toContain("# Untitled session");
  });

  it("round-trips the detail through JSON", () => {
    expect(JSON.parse(toJson(detail))).toEqual(detail);
  });
});
