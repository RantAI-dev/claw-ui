import { describe, expect, it } from "vitest";
import { isGeneratedMemoryKey, summariseRecalledMemories } from "./recalled-memories";

describe("isGeneratedMemoryKey", () => {
  it("recognises an auto-save key by its uuid tail", () => {
    expect(isGeneratedMemoryKey("user_msg_23f4b294-d91b-4ba4-9fd5-a902a78f3a82")).toBe(true);
  });

  it("leaves chosen names alone, including ones with underscores", () => {
    expect(isGeneratedMemoryKey("deploy_window")).toBe(false);
    expect(isGeneratedMemoryKey("user_lang")).toBe(false);
    expect(isGeneratedMemoryKey("plan_2026_08_06")).toBe(false);
  });
});

describe("summariseRecalledMemories", () => {
  // The reported shape: five auto-saved turns filled the chip row with hex and
  // told the reader nothing about what the answer leaned on.
  it("counts auto-saved turns instead of naming them", () => {
    expect(
      summariseRecalledMemories([
        "user_msg_23f4b294-d91b-4ba4-9fd5-a902a78f3a82",
        "user_msg_9bd37f53-4f36-4819-972b-21cf335e6280",
        "deploy_window",
      ]),
    ).toEqual(["deploy_window", "2 from this conversation"]);
  });

  it("reads as a count alone when nothing was named", () => {
    expect(
      summariseRecalledMemories([
        "user_msg_23f4b294-d91b-4ba4-9fd5-a902a78f3a82",
        "user_msg_9bd37f53-4f36-4819-972b-21cf335e6280",
      ]),
    ).toEqual(["2 from this conversation"]);
  });

  it("names up to three and summarises the tail", () => {
    expect(summariseRecalledMemories(["a", "b", "c", "d", "e"])).toEqual([
      "a",
      "b",
      "c",
      "+2 more",
    ]);
  });

  it("has no tail at exactly the shown limit", () => {
    expect(summariseRecalledMemories(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for no keys", () => {
    expect(summariseRecalledMemories([])).toEqual([]);
  });
});
