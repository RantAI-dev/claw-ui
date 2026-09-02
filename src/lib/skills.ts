import type { Skill } from "@/lib/types";

/**
 * The one place that knows the state words, the counts, the version rule and
 * the removal copy for a skill. The panel, the nav badge and the Chat rail all
 * read the same list, and they disagreed: the panel said "enabled", the badge
 * counted `enabled !== false`, the rail said "Active", while the loader had
 * already dropped a skill whose binary or env was missing. Everything that
 * turns a `Skill` into a word goes through here so the surfaces cannot drift.
 */

/**
 * What the loader substitutes when a manifest has no `version:`
 * (RantAIClaw `src/skills/mod.rs`, `load_skill_md`). The API sends it as if
 * it were the skill's version; nothing the operator does produces it, so it is
 * hidden here. Drop this once the gateway sends `null` for an unset version.
 */
export const LOADER_DEFAULT_VERSION = "0.1.0";

/** The reason the loader prepends when `[skills.entries.<name>] enabled = false`. */
const DISABLED_REASON = "disabled in config.toml";

/** The loader quotes identifiers in backticks ("missing binary `rg`"); prose here does not. */
export function plainReason(reason: string): string {
  return reason.replace(/`/g, "");
}

export type SkillState =
  | { kind: "active"; reasons: string[] }
  | { kind: "disabled"; reasons: string[] }
  | { kind: "not-loadable"; reasons: string[] };

/**
 * `active` is what the loader will actually inject; `enabled` is only the
 * config flag. A gateway older than the `active` field sends neither it nor
 * `reasons`, and an enabled skill there must read as active, never as
 * not loadable.
 */
export function skillState(skill: Skill): SkillState {
  const reasons = (skill.reasons ?? [])
    .filter((r) => r.trim() !== DISABLED_REASON)
    .map(plainReason);
  if (skill.enabled === false) return { kind: "disabled", reasons };
  if (skill.active === false || reasons.length > 0) {
    return { kind: "not-loadable", reasons };
  }
  return { kind: "active", reasons: [] };
}

export function isSkillActive(skill: Skill): boolean {
  return skillState(skill).kind === "active";
}

export interface SkillCounts {
  total: number;
  active: number;
  notLoadable: number;
  disabled: number;
}

export function skillCounts(skills: Skill[]): SkillCounts {
  const counts: SkillCounts = { total: skills.length, active: 0, notLoadable: 0, disabled: 0 };
  for (const skill of skills) {
    const state = skillState(skill).kind;
    if (state === "active") counts.active += 1;
    else if (state === "disabled") counts.disabled += 1;
    else counts.notLoadable += 1;
  }
  return counts;
}

/** "5 active · 1 not loadable · 1 disabled", or, filtered, `2 of 7 match “weather”`. */
export function countLine(
  counts: SkillCounts,
  filter?: { query: string; shown: number },
): string {
  if (filter) return `${filter.shown} of ${counts.total} match “${filter.query}”`;
  const parts = [`${counts.active} active`];
  if (counts.notLoadable) parts.push(`${counts.notLoadable} not loadable`);
  if (counts.disabled) parts.push(`${counts.disabled} disabled`);
  return parts.join(" · ");
}

/**
 * The version to print, or nothing. A ClawHub install carries the release it
 * came from in `clawhub.version`; the manifest's own field is the loader's
 * default for every skill written in the editor (which has no version field).
 */
export function versionLabel(skill: Skill): string | null {
  const hub = skill.clawhub?.version?.trim();
  if (hub) return `v${hub}`;
  const own = skill.version?.trim();
  if (!own || own === LOADER_DEFAULT_VERSION) return null;
  return `v${own}`;
}

export interface RemovalCopy {
  title: string;
  body: string;
  /** The confirm button. */
  confirm: string;
  /** The row action's accessible name. */
  actionLabel: string;
  toast: string;
}

/**
 * Removing a skill means different things by origin: an authored skill's only
 * copy is the directory being deleted; a ClawHub skill can be fetched again.
 * One sentence for both promised a reinstall that did not exist.
 */
export function removalCopy(skill: Skill): RemovalCopy {
  const name = skill.name;
  const kind = skill.origin?.kind;
  if (kind === "authored") {
    return {
      title: `Delete “${name}”?`,
      body: "Its SKILL.md is deleted. There is no other copy.",
      confirm: "Delete",
      actionLabel: `Delete ${name}`,
      toast: `Deleted ${name}`,
    };
  }
  if (kind === "clawhub") {
    const reference = skill.clawhub?.reference || skill.origin?.source || skill.slug || name;
    return {
      title: `Uninstall “${name}”?`,
      body: `It is removed from the agent. You can install ${reference} again from ClawHub.`,
      confirm: "Uninstall",
      actionLabel: `Uninstall ${name}`,
      toast: `Removed ${name}`,
    };
  }
  return {
    title: `Uninstall “${name}”?`,
    body: "It is removed from the agent.",
    confirm: "Uninstall",
    actionLabel: `Uninstall ${name}`,
    toast: `Removed ${name}`,
  };
}

export interface SkillsVerdict {
  headline: string;
  tone: "ok" | "warn";
  /** The mono meta line under the headline: counts, cron-band style. */
  meta: string[];
  detail?: string;
}

/**
 * The answer the page opens with: is every standing instruction in force?
 * A skill the loader drops is the one state worth the orange dot; disabled
 * is a choice the operator made and only counts in the meta line.
 */
export function skillsVerdict(skills: Skill[]): SkillsVerdict {
  const c = skillCounts(skills);
  if (c.total === 0) {
    return {
      headline: "No skills installed",
      tone: "warn",
      meta: [],
      detail:
        "A skill is a set of standing instructions the agent follows. Write one, or install one from ClawHub.",
    };
  }
  const meta = [`${c.total} installed`];
  if (c.notLoadable > 0) {
    meta.push(`${c.active} active`);
    if (c.disabled) meta.push(`${c.disabled} disabled`);
    const first = skills.find((s) => skillState(s).kind === "not-loadable");
    const reasons = first ? skillState(first).reasons : [];
    const why = reasons.length > 0 ? `: ${reasons.join("; ")}` : " can't load";
    const more = c.notLoadable > 1 ? ` (+${c.notLoadable - 1} more below)` : "";
    return {
      headline: `${c.notLoadable} skill${c.notLoadable === 1 ? "" : "s"} can't load`,
      tone: "warn",
      meta,
      detail: first ? `${first.name}${why}${more}` : undefined,
    };
  }
  if (c.disabled) meta.push(`${c.disabled} disabled`);
  if (c.active === 0) {
    return {
      headline: "No skills active",
      tone: "warn",
      meta,
      detail: "Every installed skill is disabled. Resume one with its power button.",
    };
  }
  return { headline: `${c.active} skill${c.active === 1 ? "" : "s"} active`, tone: "ok", meta };
}

