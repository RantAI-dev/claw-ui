import { describe, expect, it } from "vitest";
import { allowlistDrift, approvalBoundary } from "./channels-panel";

describe("allowlistDrift", () => {
  it("is silent when the server matches what the editor was seeded from", () => {
    expect(allowlistDrift(["alice", "bob"], ["alice", "bob"], ["alice"])).toBeNull();
    // Order is not drift.
    expect(allowlistDrift(["alice", "bob"], ["bob", "alice"], [])).toBeNull();
  });

  it("names someone who self-onboarded after the panel loaded", () => {
    // `carol` sent /claim while this panel sat open. Saving the box as typed
    // replaces the whole list and removes her, with nothing on screen saying so.
    const d = allowlistDrift(["alice"], ["alice", "carol"], ["alice"]);
    expect(d).not.toBeNull();
    expect(d?.wouldRevoke).toEqual(["carol"]);
  });

  it("does not claim a revocation the operator already typed back in", () => {
    const d = allowlistDrift(["alice"], ["alice", "carol"], ["alice", "carol"]);
    expect(d).not.toBeNull();
    expect(d?.wouldRevoke).toEqual([]);
  });

  it("reports entries the server dropped as well", () => {
    const d = allowlistDrift(["alice", "bob"], ["alice"], ["alice", "bob"]);
    expect(d?.alsoChanged).toEqual(["bob"]);
  });
});

describe("approvalBoundary", () => {
  it("reads owners and the autonomous_tools flag out of GET /config", () => {
    const b = approvalBoundary({
      channels_config: { approval_owners: ["1360247715"], autonomous_tools: false },
    });
    expect(b.owners).toEqual(["1360247715"]);
    expect(b.autonomousTools).toBe(false);
  });

  it("reports the flag that voids the owner list", () => {
    // With this true, an operator reading "no owners" would conclude channel
    // senders cannot trigger tools — while every message runs them unprompted.
    const b = approvalBoundary({ channels_config: { autonomous_tools: true } });
    expect(b.autonomousTools).toBe(true);
    expect(b.owners).toEqual([]);
  });

  it("is empty, not undefined, for a config with no channels section", () => {
    expect(approvalBoundary(null)).toEqual({ owners: [], autonomousTools: false });
    expect(approvalBoundary({})).toEqual({ owners: [], autonomousTools: false });
  });
});
