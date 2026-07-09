import { describe, it, expect } from "vitest";
import { createLoginGuard } from "./login-guard";

const OPTS = { maxAttempts: 5, windowMs: 300_000 };
const T = 1_000_000; // fixed base "now" (ms) — deterministic, no Date.now()

describe("login-guard", () => {
  it("stays unlocked for failures below the limit", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 4; i++) {
      expect(g.recordFailure("ip", T + i)).toBe(0);
      expect(g.retryAfter("ip", T + i)).toBe(0);
    }
  });

  it("locks on the 5th failure and reports retry-after seconds", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 4; i++) g.recordFailure("ip", T);
    const retry = g.recordFailure("ip", T); // 5th
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(300);
    expect(g.retryAfter("ip", T)).toBeGreaterThan(0);
  });

  it("unlocks after the window slides past the oldest failure", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 5; i++) g.recordFailure("ip", T);
    expect(g.retryAfter("ip", T)).toBeGreaterThan(0);
    expect(g.retryAfter("ip", T + 300_001)).toBe(0);
  });

  it("resets the counter on a successful login", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 5; i++) g.recordFailure("ip", T);
    expect(g.retryAfter("ip", T)).toBeGreaterThan(0);
    g.clearAttempts("ip");
    expect(g.retryAfter("ip", T)).toBe(0);
  });

  it("tracks keys independently", () => {
    const g = createLoginGuard(OPTS);
    for (let i = 0; i < 5; i++) g.recordFailure("a", T);
    expect(g.retryAfter("a", T)).toBeGreaterThan(0);
    expect(g.retryAfter("b", T)).toBe(0);
  });

  it("evicts expired keys without throwing when maxKeys is exceeded", () => {
    const g = createLoginGuard({ maxAttempts: 5, windowMs: 1_000, maxKeys: 2 });
    g.recordFailure("old1", 0);
    g.recordFailure("old2", 0);
    expect(() => g.recordFailure("new", 10_000)).not.toThrow();
    expect(g.retryAfter("old1", 10_000)).toBe(0);
  });
});
