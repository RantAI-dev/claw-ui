import { describe, it, expect } from "vitest";
import {
  AUTONOMY,
  autonomyPreset,
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

  it("labels a preset id directly", () => {
    expect(autonomyPreset("manual").label).toBe("Manual");
    expect(autonomyPreset("strict").label).toBe("Strict");
    expect(autonomyPreset("off").label).toBe("Off");
  });

  it("labels a raw level only through levelToRung", () => {
    // The Status tile composes these two: it prefers `/status`'s
    // `autonomy_preset` and falls back to `levelToRung(autonomy)` on an older
    // gateway. `autonomyPreset` alone does NOT understand the Debug level
    // spellings — its alias map has no `readonly` entry, so a raw `ReadOnly`
    // silently lands on the Smart default. Composing through `levelToRung` is
    // what makes the fallback correct, and this pins that.
    expect(autonomyPreset("ReadOnly").label).toBe("Smart"); // wrong on its own
    expect(autonomyPreset(levelToRung("ReadOnly")).label).toBe("Strict");
    expect(autonomyPreset(levelToRung("Full")).label).toBe("Off");
    expect(autonomyPreset(levelToRung("Supervised")).label).toBe("Smart");
  });
});
