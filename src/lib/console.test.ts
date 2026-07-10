import { describe, it, expect } from "vitest";
import { resolveHashRoute } from "./console";

describe("resolveHashRoute", () => {
  it("aliases legacy #kbgraph deep-links to kb", () => {
    expect(resolveHashRoute("kbgraph")).toBe("kb");
  });
  it("passes through a real route id", () => {
    expect(resolveHashRoute("status")).toBe("status");
  });
  it("returns null for an unknown hash", () => {
    expect(resolveHashRoute("nope")).toBeNull();
  });
});
