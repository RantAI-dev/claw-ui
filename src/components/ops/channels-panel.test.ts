import { describe, expect, it } from "vitest";
import { allowlistDrift } from "./channels-panel";

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
