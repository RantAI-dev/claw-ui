import { describe, it, expect } from "vitest";
import { toMarkdown, toJson } from "./transcript-export";
import type { SessionDetail } from "./types";
import { GUI_INSTRUCTION } from "./decorations";

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
  it("does not export the decorations the console appended to the sent message", () => {
    // What the gateway actually stored for a turn sent in generative-UI mode
    // by a client that also prepended its own transcript.
    const decorated: SessionDetail = {
      ...detail,
      messages: [
        {
          role: "user",
          content:
            "Where to?\n\n<<<CONVERSATION_SO_FAR>>>\n(earlier messages in this conversation, for context)\nUser: hi\nAssistant: hello\n<<<END_CONVERSATION>>>",
          timestamp: 0,
        },
        { role: "assistant", content: "Kyoto.", timestamp: 1 },
      ],
    };

    const md = toMarkdown(decorated);
    expect(md).toContain("Where to?");
    expect(md).not.toContain("<<<CONVERSATION_SO_FAR>>>");
    expect(md).not.toContain("<<<END_CONVERSATION>>>");
    expect(md).not.toContain("earlier messages in this conversation");
  });

  it("does not export the generative-UI render instruction", () => {
    const decorated: SessionDetail = {
      ...detail,
      messages: [
        {
          role: "user",
          content: `Show me the numbers\n\n${GUI_INSTRUCTION}`,
          timestamp: 0,
        },
      ],
    };

    const md = toMarkdown(decorated);
    expect(md).toContain("Show me the numbers");
    expect(md).not.toContain("RENDER MODE");
  });

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
