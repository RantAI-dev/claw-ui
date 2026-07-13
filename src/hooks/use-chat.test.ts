import { describe, expect, it } from "vitest";
import { buildHistory } from "./use-chat";
import type { ChatMessage } from "@/lib/types";

function msg(role: "user" | "assistant", content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: `${role}-${content}`, role, content, ...extra };
}

describe("buildHistory", () => {
  it("returns an empty string when there is no prior turn", () => {
    expect(buildHistory([])).toBe("");
  });

  it("keeps completed turns verbatim", () => {
    const out = buildHistory([msg("user", "hi"), msg("assistant", "hello")]);
    expect(out).toBe("User: hi\nAssistant: hello");
  });

  it("excludes a cancelled turn whole — the assistant partial AND its paired user message", () => {
    // The reported bug: cancelling "install docker" then asking something else
    // must not carry the abandoned docker topic into the next request.
    const out = buildHistory([
      msg("user", "install docker in a VM"),
      msg("assistant", "installing docker...", { cancelled: true }),
      msg("user", "analyze the data center"),
    ]);
    expect(out).toBe("User: analyze the data center");
    expect(out).not.toContain("docker");
  });

  it("drops a failed assistant reply but keeps its user question", () => {
    const out = buildHistory([msg("user", "what is 2+2"), msg("assistant", "", { error: "provider error" })]);
    expect(out).toBe("User: what is 2+2");
  });
});
