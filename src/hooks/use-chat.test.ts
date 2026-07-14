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

  it("strips [IMAGE:…] markers so a model-emitted one can't poison later turns", () => {
    // The gateway counts [IMAGE:…] as an image input even inside a text history
    // block, so a marker the model once emitted would hard-fail every following
    // turn on a provider without vision. Embedded history must not carry it.
    const out = buildHistory([
      msg("user", "show me a diagram"),
      msg("assistant", "Here it is: [IMAGE:diagram1] hope it helps"),
      msg("user", "what next"),
    ]);
    expect(out).not.toContain("[IMAGE:");
    expect(out).toContain("Here it is:");
    expect(out).toContain("hope it helps");
  });
});
