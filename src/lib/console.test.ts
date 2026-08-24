import { describe, it, expect } from "vitest";
import {
  AUTONOMY,
  autonomyPreset,
  autonomyReadIsStale,
  nextCycledRung,
  levelToRung,
  maskConfigForDisplay,
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
  it("returns null for inherited Object members (no prototype-chain resolution)", () => {
    // `in` walks the prototype chain; a crafted hash must not resolve to an
    // inherited member and crash the route.
    for (const h of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
      expect(resolveHashRoute(h)).toBeNull();
    }
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

describe("nextCycledRung", () => {
  it("never lands on `off` — the rung with no prompts", () => {
    // Shift+Tab is one keypress, from any non-editable focus, with no
    // confirmation. It used to walk straight into autonomous execution.
    let rung = "manual";
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      rung = nextCycledRung(rung)!;
      seen.push(rung);
    }
    expect(seen).not.toContain("off");
    expect(new Set(seen)).toEqual(new Set(["manual", "smart", "strict"]));
  });

  it("escapes `off` rather than sticking there", () => {
    expect(nextCycledRung("off")).toBe("manual");
  });
});

describe("autonomyReadIsStale", () => {
  it("discards a read that began before a local write", () => {
    expect(autonomyReadIsStale(100, 200)).toBe(true);
  });

  it("keeps a read that began after the write", () => {
    expect(autonomyReadIsStale(300, 200)).toBe(false);
  });
});

describe("maskConfigForDisplay", () => {
  it("masks MCP env VALUES while keeping their names", () => {
    // The backend redacts by key-name suffix, which cannot cover arbitrary
    // operator-chosen env names — and API keys live there routinely, under a
    // label that claimed "secrets redacted".
    const masked = maskConfigForDisplay({
      mcp_servers: {
        github: { command: "npx", env: { GITHUB_TOKEN: "ghp_realsecret", DEBUG: "1" } },
      },
    }) as { mcp_servers: { github: { command: string; env: Record<string, string> } } };

    expect(masked.mcp_servers.github.env.GITHUB_TOKEN).not.toContain("ghp_realsecret");
    expect(Object.keys(masked.mcp_servers.github.env)).toEqual(["GITHUB_TOKEN", "DEBUG"]);
    // Non-secret fields are untouched.
    expect(masked.mcp_servers.github.command).toBe("npx");
  });

  it("does not mutate the caller's config", () => {
    const original = { mcp_servers: { x: { env: { K: "secret" } } } };
    maskConfigForDisplay(original);
    expect(original.mcp_servers.x.env.K).toBe("secret");
  });

  it("passes through a config with no MCP servers", () => {
    expect(maskConfigForDisplay({ autonomy: { level: "smart" } })).toEqual({
      autonomy: { level: "smart" },
    });
  });
});
