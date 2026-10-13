import { describe, it, expect } from "vitest";
import { createRevocationSet } from "./session-store";

const T = 1_700_000_000_000;
const LIVE = T + 24 * 60 * 60 * 1000;

describe("revocation set", () => {
  it("remembers a revoked session id until its expiry", () => {
    const set = createRevocationSet();
    set.revoke("sid-a", LIVE, T);
    expect(set.has("sid-a", T)).toBe(true);
    expect(set.has("sid-b", T)).toBe(false);
  });

  it("drops entries whose expiry has passed once it is full", () => {
    const set = createRevocationSet({ maxKeys: 2 });
    set.revoke("old-1", T + 10, T);
    set.revoke("old-2", T + 10, T);
    set.revoke("new", LIVE, T + 20);
    expect(set.has("old-1", T + 20)).toBe(false);
    expect(set.has("old-2", T + 20)).toBe(false);
    expect(set.has("new", T + 20)).toBe(true);
  });

  it("never drops a live revocation to make room", () => {
    // Forgetting a live entry would let its cookie back in; the set grows past
    // its cap instead, the way login-guard keeps a live lockout.
    const set = createRevocationSet({ maxKeys: 2 });
    set.revoke("a", LIVE, T);
    set.revoke("b", LIVE, T);
    set.revoke("c", LIVE, T);
    expect(set.has("a", T)).toBe(true);
    expect(set.has("b", T)).toBe(true);
    expect(set.has("c", T)).toBe(true);
  });
});
