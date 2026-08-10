import { describe, expect, it } from "vitest";

import type { KbCapability } from "@/lib/types";

import { deriveGraphState } from "./graph-lens-helpers";

// Plan 097 (RantAIClaw): the console's honesty about WHY a graph is empty
// lives entirely in this pure function — these are the only tests pinning it.

const cap = (over: Partial<KbCapability> = {}): KbCapability => ({
  intelligence_enabled: true,
  extraction_model: "openai/gpt-4.1-nano",
  credential_configured: true,
  ...over,
});

describe("deriveGraphState", () => {
  it("loading before the first response", () => {
    expect(deriveGraphState(undefined, undefined, true, false)).toBe("loading");
  });

  it("disabled when intelligence is off", () => {
    expect(deriveGraphState(cap({ intelligence_enabled: false }), 0, false, true)).toBe(
      "disabled",
    );
  });

  it("no-credential when enabled but no key resolves", () => {
    expect(deriveGraphState(cap({ credential_configured: false }), 0, false, true)).toBe(
      "no-credential",
    );
  });

  it("empty when enabled with a key and zero entities", () => {
    expect(deriveGraphState(cap(), 0, false, true)).toBe("empty");
  });

  it("ready when entities exist", () => {
    expect(deriveGraphState(cap(), 12, false, true)).toBe("ready");
  });

  it("older gateways without the credential field fall through to empty, never no-credential", () => {
    // credential_configured is optional in the wire type; undefined must not
    // be treated as "missing credential".
    expect(deriveGraphState(cap({ credential_configured: undefined }), 0, false, true)).toBe(
      "empty",
    );
  });
});

describe("deriveGraphState as used by the drawer (plan 111)", () => {
  // The drawer passes corpusEntities=0, loading=false, hasData=true and
  // branches its empty-state on the result — pin the three branches it
  // renders so drawer and graph tab cannot drift apart again.
  it("drawer branch: disabled", () => {
    expect(deriveGraphState(cap({ intelligence_enabled: false }), 0, false, true)).toBe(
      "disabled",
    );
  });
  it("drawer branch: no-credential", () => {
    expect(deriveGraphState(cap({ credential_configured: false }), 0, false, true)).toBe(
      "no-credential",
    );
  });
  it("drawer branch: genuinely empty (incl. missing capability)", () => {
    expect(deriveGraphState(cap(), 0, false, true)).toBe("empty");
    expect(deriveGraphState(undefined, 0, false, true)).toBe("empty");
  });
});
