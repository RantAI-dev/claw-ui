import { describe, it, expect } from "vitest";
import {
  AUTONOMY,
  autonomyPreset,
  autonomyReadIsStale,
  nextCycledRung,
  maskConfigForDisplay,
  configVerdict,
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

  it("masks the arg after a credential flag", () => {
    const masked = maskConfigForDisplay({
      mcp_servers: {
        qa: { command: "npx", args: ["-y", "qa-server", "--api-key", "sk-arg-9999"] },
      },
    }) as { mcp_servers: { qa: { args: string[] } } };
    expect(masked.mcp_servers.qa.args).toEqual(["-y", "qa-server", "--api-key", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"]);
  });

  it("masks inline --flag=value forms and bare key-shaped args", () => {
    const masked = maskConfigForDisplay({
      mcp_servers: { qa: { args: ["--token=tok123", "--verbose", "sk-live-abc"] } },
    }) as { mcp_servers: { qa: { args: string[] } } };
    expect(masked.mcp_servers.qa.args).toEqual([
      "--token=\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
      "--verbose",
      "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    ]);
  });

  it("masks the value after --max-keys too: parity with the gateway heuristic, not perfection", () => {
    const masked = maskConfigForDisplay({
      mcp_servers: { qa: { args: ["--max-keys", "10"] } },
    }) as { mcp_servers: { qa: { args: string[] } } };
    expect(masked.mcp_servers.qa.args).toEqual(["--max-keys", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"]);
  });

  it("masks a key-shaped command and keeps a normal one", () => {
    const masked = maskConfigForDisplay({
      mcp_servers: { a: { command: "sk-something" }, b: { command: "npx" } },
    }) as { mcp_servers: Record<string, { command: string }> };
    expect(masked.mcp_servers.a.command).toBe("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022");
    expect(masked.mcp_servers.b.command).toBe("npx");
  });

  it("passes non-string arg members through and still masks after a flag", () => {
    const masked = maskConfigForDisplay({
      mcp_servers: { qa: { args: [1, "--key", "v"] as unknown[] } },
    }) as { mcp_servers: { qa: { args: unknown[] } } };
    expect(masked.mcp_servers.qa.args).toEqual([1, "--key", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"]);
  });

  it("does not mutate the caller's args", () => {
    const original = { mcp_servers: { x: { args: ["--key", "v"] } } };
    maskConfigForDisplay(original);
    expect(original.mcp_servers.x.args).toEqual(["--key", "v"]);
  });
});

describe("configVerdict", () => {
  const base = {
    default_provider: "ollama",
    default_model: "stub:latest",
    mcp_servers: { qa: {} },
  };

  it("reads the runtime default as the calm verdict", () => {
    const v = configVerdict({ ...base, default_temperature: 0.7 });
    expect(v.tone).toBe("ok");
    expect(v.headline).toBe("Sampling at 0.7, the runtime default");
    expect(v.meta).toEqual(["ollama", "stub:latest", "1 MCP server"]);
    expect(v.detail).toBeNull();
  });

  it("drops the default suffix for a tuned value", () => {
    expect(configVerdict({ ...base, default_temperature: 1.4 }).headline).toBe("Sampling at 1.4");
  });

  it("warns on a value providers would reject, with the fix named", () => {
    const v = configVerdict({ ...base, default_temperature: 3 });
    expect(v.tone).toBe("warn");
    expect(v.headline).toBe("Sampling 3 is out of range");
    expect(v.detail).toMatch(/0\.0 to 2\.0/);
  });

  it("warns when the gateway sends no temperature", () => {
    const v = configVerdict({ mcp_servers: {} });
    expect(v.tone).toBe("warn");
    expect(v.headline).toBe("Sampling not reported");
    expect(v.meta).toEqual(["0 MCP servers"]);
  });
});
