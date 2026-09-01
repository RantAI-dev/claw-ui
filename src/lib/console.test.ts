import { describe, it, expect } from "vitest";
import {
  AUTONOMY,
  autonomyPreset,
  autonomyReadIsStale,
  nextCycledRung,
  maskConfigForDisplay,
  resolveHashRoute,
} from "./console";
import { rungFromAutonomy } from "./autonomy";

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

describe("autonomy presets", () => {
  it("labels a preset id directly", () => {
    expect(autonomyPreset("manual").label).toBe("Manual");
    expect(autonomyPreset("strict").label).toBe("Strict");
    expect(autonomyPreset("off").label).toBe("Off");
  });

  it("labels a raw level only through rungFromAutonomy", () => {
    // `autonomyPreset` alone does NOT understand the level spellings: its
    // alias map has no `readonly` entry, so a raw `ReadOnly` silently lands on
    // the Smart default. Every consumer composes through `rungFromAutonomy`
    // (lib/autonomy.ts), and this pins that the composition is correct.
    expect(autonomyPreset("ReadOnly").label).toBe("Smart"); // wrong on its own
    expect(autonomyPreset(rungFromAutonomy({ level: "ReadOnly" })).label).toBe("Strict");
    expect(autonomyPreset(rungFromAutonomy({ level: "Full" })).label).toBe("Off");
    expect(autonomyPreset(rungFromAutonomy({ level: "Supervised" })).label).toBe("Smart");
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
