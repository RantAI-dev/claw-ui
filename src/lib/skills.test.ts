import { describe, expect, it } from "vitest";
import type { Skill } from "@/lib/types";
import {
  countLine,
  isSkillActive,
  plainReason,
  removalCopy,
  skillCounts,
  skillState,
  versionLabel,
} from "./skills";

function skill(over: Partial<Skill> = {}): Skill {
  return {
    name: "Kopi Pagi",
    version: "0.1.0",
    description: "Brew V60.",
    tags: [],
    tools: [],
    enabled: true,
    active: true,
    reasons: [],
    slug: "kopi-pagi",
    origin: { kind: "authored", source: null },
    ...over,
  };
}

const GATED_REASONS = ["missing binary `definitely-missing-bin-xyz`", "env `QA_MISSING_ENV` not set"];

describe("skillState", () => {
  it("calls an enabled, loadable skill active", () => {
    expect(skillState(skill())).toEqual({ kind: "active", reasons: [] });
  });

  it("calls a skill the loader drops not loadable, with its reasons in plain words and in order", () => {
    expect(skillState(skill({ active: false, reasons: GATED_REASONS }))).toEqual({
      kind: "not-loadable",
      reasons: ["missing binary definitely-missing-bin-xyz", "env QA_MISSING_ENV not set"],
    });
  });

  it("lets disabled win, keeping the other reasons and dropping the config one", () => {
    expect(
      skillState(
        skill({ enabled: false, active: false, reasons: ["disabled in config.toml", ...GATED_REASONS] }),
      ),
    ).toEqual({
      kind: "disabled",
      reasons: ["missing binary definitely-missing-bin-xyz", "env QA_MISSING_ENV not set"],
    });
    expect(skillState(skill({ enabled: false, active: false, reasons: ["disabled in config.toml"] }))).toEqual(
      { kind: "disabled", reasons: [] },
    );
  });

  it("reads an older gateway's enabled skill (no active, no reasons) as active", () => {
    const s = skill();
    delete s.active;
    delete s.reasons;
    expect(skillState(s).kind).toBe("active");
    expect(isSkillActive(s)).toBe(true);
  });

  it("isSkillActive is false for disabled and not loadable", () => {
    expect(isSkillActive(skill({ enabled: false }))).toBe(false);
    expect(isSkillActive(skill({ active: false, reasons: GATED_REASONS }))).toBe(false);
  });
});

describe("plainReason", () => {
  it("strips the loader's backticks", () => {
    expect(plainReason("missing binary `rg`")).toBe("missing binary rg");
  });
});

describe("skillCounts and countLine", () => {
  const list = [
    skill(),
    skill({ name: "weather-lite", slug: "weather-lite" }),
    skill({ name: "Needs Ripgrep Plus", active: false, reasons: GATED_REASONS }),
    skill({ name: "Prose Only", enabled: false, active: false, reasons: ["disabled in config.toml"] }),
  ];

  it("counts by state", () => {
    expect(skillCounts(list)).toEqual({ total: 4, active: 2, notLoadable: 1, disabled: 1 });
  });

  it("writes the line without zero parts", () => {
    expect(countLine(skillCounts(list))).toBe("2 active · 1 not loadable · 1 disabled");
    expect(countLine(skillCounts([skill()]))).toBe("1 active");
    expect(countLine(skillCounts([skill({ enabled: false })]))).toBe("0 active · 1 disabled");
  });

  it("names the filter when one is applied", () => {
    expect(countLine(skillCounts(list), { query: "weather", shown: 1 })).toBe("1 of 4 match “weather”");
  });
});

describe("versionLabel", () => {
  it("prefers the ClawHub release over the manifest default", () => {
    expect(
      versionLabel(
        skill({
          version: "0.1.0",
          clawhub: { owner: "steipete", slug: "weather", version: "1.0.0", reference: "@steipete/weather" },
        }),
      ),
    ).toBe("v1.0.0");
  });

  it("hides the loader's default for a skill nobody versioned", () => {
    expect(versionLabel(skill({ version: "0.1.0" }))).toBeNull();
    expect(versionLabel(skill({ version: null }))).toBeNull();
    expect(versionLabel(skill({ version: "" }))).toBeNull();
  });

  it("shows a version someone set", () => {
    expect(versionLabel(skill({ version: "1.2.0" }))).toBe("v1.2.0");
  });
});

describe("removalCopy", () => {
  it("calls it a delete for an authored skill and says there is no other copy", () => {
    expect(removalCopy(skill())).toEqual({
      title: "Delete “Kopi Pagi”?",
      body: "Its SKILL.md is deleted. There is no other copy.",
      confirm: "Delete",
      actionLabel: "Delete Kopi Pagi",
      toast: "Deleted Kopi Pagi",
    });
  });

  it("names the ClawHub reference to install again", () => {
    const copy = removalCopy(
      skill({
        name: "weather",
        slug: "weather",
        origin: { kind: "clawhub", source: "@steipete/weather" },
        clawhub: { owner: "steipete", slug: "weather", version: "1.0.0", reference: "@steipete/weather" },
      }),
    );
    expect(copy.title).toBe("Uninstall “weather”?");
    expect(copy.body).toBe("It is removed from the agent. You can install @steipete/weather again from ClawHub.");
    expect(copy.confirm).toBe("Uninstall");
    expect(copy.actionLabel).toBe("Uninstall weather");
    expect(copy.toast).toBe("Removed weather");
  });

  it("falls back to the origin source, then the slug, for the reference", () => {
    expect(
      removalCopy(skill({ name: "weather", slug: "weather", origin: { kind: "clawhub", source: "@x/weather" } })).body,
    ).toContain("@x/weather");
    expect(
      removalCopy(skill({ name: "weather", slug: "weather", origin: { kind: "clawhub", source: null } })).body,
    ).toContain("install weather again");
  });

  it("promises nothing for a bundled, git, local or unknown origin", () => {
    for (const origin of [
      { kind: "bundled" as const, source: null },
      { kind: "git" as const, source: "https://example.com/r.git" },
      { kind: "local" as const, source: "/tmp/s" },
      undefined,
    ]) {
      const copy = removalCopy(skill({ name: "summarizer", origin }));
      expect(copy.title).toBe("Uninstall “summarizer”?");
      expect(copy.body).toBe("It is removed from the agent.");
      expect(copy.confirm).toBe("Uninstall");
    }
  });
});
