import { describe, expect, it } from "vitest";
import {
  AUTONOMY,
} from "./console";
import {
  BUILTIN_TOOLS,
  autoApproveEffective,
  capsChanges,
  capsSeed,
  commandBasename,
  isHighRiskCommand,
  rungFromAutonomy,
  rungToAutonomyPayload,
  toolOutcome,
  toolRows,
} from "./autonomy";

describe("rungFromAutonomy", () => {
  it("reads a fresh install as Smart, not Manual", () => {
    // The default config ships `always_ask = ["ssh", "pty"]` beside
    // `auto_approve = ["file_read", "memory_recall"]`. Counting entries called
    // that "Manual: prompt for every tool call" while two tools ran unasked.
    expect(rungFromAutonomy({ level: "supervised", always_ask: ["ssh", "pty"] })).toBe("smart");
  });

  it("reads the wildcard, or the whole built-in set, as Manual", () => {
    expect(rungFromAutonomy({ level: "supervised", always_ask: ["*"] })).toBe("manual");
    expect(rungFromAutonomy({ level: "supervised", always_ask: [...BUILTIN_TOOLS] })).toBe("manual");
    expect(
      rungFromAutonomy({ level: "supervised", always_ask: BUILTIN_TOOLS.slice(1) }),
    ).toBe("smart");
  });

  it("reads the level spellings the gateway actually sends", () => {
    // GET /config serialises the enum as `readonly`; GET /status sends the
    // Debug form (`ReadOnly`). Both must land on the same rung.
    for (const level of ["readonly", "ReadOnly", "read_only", "read-only"]) {
      expect(rungFromAutonomy({ level })).toBe("strict");
    }
    expect(rungFromAutonomy({ level: "full" })).toBe("off");
    expect(rungFromAutonomy({ level: "Full" })).toBe("off");
    expect(rungFromAutonomy({ level: "Supervised" })).toBe("smart");
    expect(rungFromAutonomy(null)).toBe("smart");
  });
});

describe("rungToAutonomyPayload", () => {
  const current = { level: "supervised", always_ask: ["ssh", "pty"] };

  it("writes the wildcard and clears auto-approve for Manual, as the CLI does", () => {
    expect(rungToAutonomyPayload("manual", { always_ask: ["ssh"] })).toEqual({
      level: "supervised",
      always_ask: ["*"],
      auto_approve: [],
    });
  });

  it("keeps foreign always-ask entries for Smart and drops the wildcard and built-ins", () => {
    expect(
      rungToAutonomyPayload("smart", { always_ask: ["*", "shell", "ssh", "pty"] }),
    ).toEqual({ level: "supervised", always_ask: ["ssh", "pty"] });
    expect(rungToAutonomyPayload("smart", null)).toEqual({ level: "supervised", always_ask: [] });
  });

  it("sends the level only for Strict and Off", () => {
    expect(rungToAutonomyPayload("strict", current)).toEqual({ level: "readonly" });
    expect(rungToAutonomyPayload("off", current)).toEqual({ level: "full" });
  });

  it("round-trips every rung through the config encoding", () => {
    // `level` + `always_ask` is the wire format the console shares with the
    // TUI/CLI. If the writer and the reader stop being inverses, a preset
    // switched on one surface is misread on the other.
    for (const { id } of AUTONOMY) {
      const p = rungToAutonomyPayload(id, current);
      expect(rungFromAutonomy({ level: p.level, always_ask: p.always_ask ?? current.always_ask })).toBe(id);
    }
  });
});

describe("toolOutcome / autoApproveEffective", () => {
  it("follows the runtime's precedence: level, always-ask, auto-approve, default", () => {
    expect(toolOutcome("file_read", { level: "full", auto_approve: [] })).toBe("runs (Off: nothing prompts)");
    expect(toolOutcome("file_write", { level: "readonly", auto_approve: ["file_write"] })).toBe(
      "denied unless read-only (Strict)",
    );
    // The wildcard wins over an auto-approve entry: the switch used to say
    // "runs without asking" for a call that opened "Approve tool?".
    expect(toolOutcome("file_read", { level: "supervised", always_ask: ["*"], auto_approve: ["file_read"] })).toBe(
      "always prompts",
    );
    expect(toolOutcome("ssh", { level: "supervised", always_ask: ["ssh"] })).toBe("always prompts");
    expect(toolOutcome("file_read", { level: "supervised", always_ask: [], auto_approve: ["file_read"] })).toBe(
      "runs without asking",
    );
    expect(toolOutcome("shell", { level: "supervised", always_ask: [], auto_approve: [] })).toBe("prompts");
  });

  it("says when the switch cannot take effect", () => {
    expect(autoApproveEffective("shell", { level: "full" })).toBe(false);
    expect(autoApproveEffective("shell", { level: "readonly" })).toBe(false);
    expect(autoApproveEffective("shell", { level: "supervised", always_ask: ["*"] })).toBe(false);
    expect(autoApproveEffective("ssh", { level: "supervised", always_ask: ["ssh"] })).toBe(false);
    expect(autoApproveEffective("shell", { level: "supervised", always_ask: ["ssh"] })).toBe(true);
  });
});

describe("toolRows", () => {
  it("lists the built-ins first, then every other name the config mentions, once", () => {
    expect(
      toolRows({ auto_approve: ["file_read", "http_request"], always_ask: ["ssh", "*"] }),
    ).toEqual([...BUILTIN_TOOLS, "http_request", "ssh"]);
  });
});

describe("commandBasename / isHighRiskCommand", () => {
  it("keeps what the gateway stores", () => {
    expect(commandBasename("/usr/bin/git ")).toBe("git");
    expect(commandBasename("docker")).toBe("docker");
    expect(commandBasename("  ")).toBe("");
  });

  it("names the commands the CLI warns about", () => {
    expect(isHighRiskCommand("rm")).toBe(true);
    expect(isHighRiskCommand("docker")).toBe(false);
  });
});

describe("capsChanges", () => {
  const stored = { actions: 200, cents: 500 };

  it("seeds the fields in the units the operator types", () => {
    expect(capsSeed(stored)).toEqual({ actions: "200", cost: "5" });
    expect(capsSeed({ actions: null, cents: null })).toEqual({ actions: "", cost: "" });
  });

  it("is clean when nothing changed", () => {
    expect(capsChanges({ actions: "200", cost: "5" }, stored)).toEqual({ write: null, dirty: false, error: null });
    expect(capsChanges({ actions: "200", cost: "5.00" }, stored).dirty).toBe(false);
  });

  it("rejects what the gateway would refuse, before the request", () => {
    expect(capsChanges({ actions: "0", cost: "5" }, stored).error).toBe("Actions per hour must be at least 1");
    expect(capsChanges({ actions: "200", cost: "-1" }, stored).error).toBe("Cost per day must be 0 or more");
    expect(capsChanges({ actions: "", cost: "5" }, stored)).toMatchObject({ dirty: true, write: null, error: "Enter both caps" });
  });

  it("writes cents, rounded", () => {
    expect(capsChanges({ actions: "300", cost: "12.345" }, stored)).toEqual({
      write: { max_actions_per_hour: 300, max_cost_per_day_cents: 1235 },
      dirty: true,
      error: null,
    });
  });
});
