import { describe, it, expect } from "vitest";
import {
  AUTONOMY,
  levelToRung,
  resolveHashRoute,
  rungToAutonomyPayload,
} from "./console";

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

describe("autonomy rung encoding", () => {
  // `level` + `always_ask` is the wire format the console shares with the
  // TUI/CLI, which write the same pair (RantaiClaw `apply_preset_to_config` /
  // `preset_for_autonomy`). If these two stop being inverses, a preset
  // switched on one surface is misread — or not seen at all — on the other.
  it("round-trips every rung through the config encoding", () => {
    for (const { id } of AUTONOMY) {
      const payload = rungToAutonomyPayload(id);
      expect(
        levelToRung(payload.level, payload.always_ask?.length ?? 0),
      ).toBe(id);
    }
  });

  it("separates manual from smart only by always_ask", () => {
    // Both rungs are `supervised`; the count is the entire discriminator, so a
    // writer that leaves `always_ask` untouched collapses them.
    expect(rungToAutonomyPayload("manual").level).toBe("supervised");
    expect(rungToAutonomyPayload("smart").level).toBe("supervised");
    expect(levelToRung("supervised", 0)).toBe("smart");
    expect(levelToRung("supervised", 1)).toBe("manual");
  });

  it("reads the level spellings the gateway actually sends", () => {
    // GET /config serialises the enum as `readonly`; GET /status sends the
    // Debug form (`ReadOnly`). Both must land on the same rung.
    expect(levelToRung("readonly")).toBe("strict");
    expect(levelToRung("ReadOnly")).toBe("strict");
    expect(levelToRung("read_only")).toBe("strict");
    expect(levelToRung("full")).toBe("off");
    expect(levelToRung("Full")).toBe("off");
  });
});
