import { ApiError } from "@/lib/api";
import type { KbGroup, Personality } from "@/lib/types";

/** The persona as the form holds it: every field a string, bases as ids. */
export interface PersonaForm {
  preset: string;
  name: string;
  timezone: string;
  role: string;
  tone: string;
  avoid: string;
  alwaysOn: string[];
}

/**
 * What the gateway writes for a first partial PUT and what `setup persona`
 * writes headless: `PersonaToml::default_for("RantaiClaw", "UTC")` in
 * `persona/mod.rs`. Shown in the fresh form so Save writes what is on screen,
 * not empty strings over these. Change both sides in the same release.
 */
export const RUNTIME_DEFAULTS = {
  preset: "default",
  name: "RantaiClaw",
  role: "general productivity and helpful assistance",
  tone: "neutral",
} as const;

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The runtime prints the timezone verbatim into the prompt; only the console can check it. */
export function isValidTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneOptions(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  return typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : [];
}

/** No `persona.toml` yet: the gateway answers `{ preset: null, configured: false }`. */
export function isFresh(p: Personality): boolean {
  return p.configured === false || p.preset === null;
}

export function formFromPersonality(p: Personality): PersonaForm {
  return {
    preset: p.preset ?? "",
    name: p.name ?? "",
    timezone: p.timezone ?? "",
    role: p.role ?? "",
    tone: p.tone ?? "",
    avoid: p.avoid ?? "",
    alwaysOn: Array.isArray(p.always_on_kbs) ? p.always_on_kbs : [],
  };
}

export function freshForm(timezone: string): PersonaForm {
  return { ...RUNTIME_DEFAULTS, timezone, avoid: "", alwaysOn: [] };
}

export function trimForm(f: PersonaForm): PersonaForm {
  return {
    preset: f.preset.trim(),
    name: f.name.trim(),
    timezone: f.timezone.trim(),
    role: f.role.trim(),
    tone: f.tone.trim(),
    avoid: f.avoid.trim(),
    alwaysOn: f.alwaysOn,
  };
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function isDirty(form: PersonaForm, saved: PersonaForm): boolean {
  const f = trimForm(form);
  const s = trimForm(saved);
  return (
    f.preset !== s.preset ||
    f.name !== s.name ||
    f.timezone !== s.timezone ||
    f.role !== s.role ||
    f.tone !== s.tone ||
    f.avoid !== s.avoid ||
    !sameSet(f.alwaysOn, s.alwaysOn)
  );
}

export type FieldKey = "name" | "timezone" | "role" | "tone";

/**
 * The templates print name, timezone, role and tone inline, so a blank one
 * prints a broken sentence on every turn ("Your primary role is: "). Avoid has
 * a block guard and stays optional.
 */
export function fieldErrors(form: PersonaForm): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!form.name.trim()) errors.name = "Name is required.";
  if (!form.role.trim()) errors.role = "Role is required.";
  if (!form.tone.trim()) errors.tone = "Tone is required.";
  if (!form.timezone.trim()) errors.timezone = "Timezone is required.";
  else if (!isValidTimeZone(form.timezone)) errors.timezone = "Not an IANA timezone, like Asia/Jakarta.";
  return errors;
}

/** A counter only when the cap is near; the cap itself is enforced by `maxLength`. */
export function nearCap(value: string, max: number): string | null {
  return value.length >= max - 20 ? `${value.length}/${max}` : null;
}

export interface PersonaVerdict {
  headline: string;
  tone: "ok" | "warn";
  /** The mono meta line under the headline, cron-band style. */
  meta: string[];
  detail?: string;
}

/**
 * The answer the page opens with: who is the agent on its next prompt?
 * Derived from the SAVED persona only; edits below never move the band
 * until they are saved, as on the other panels' verdicts.
 */
export function personaVerdict(p: Personality): PersonaVerdict {
  if (isFresh(p)) {
    return {
      headline: "No persona saved yet",
      tone: "warn",
      meta: [`profile ${p.profile}`],
      detail:
        "The agent runs without a persona section until you save one; the form below holds the runtime defaults.",
    };
  }
  const meta = [
    p.preset ? `${p.preset} preset` : "",
    p.tone?.trim() ? `${p.tone.trim()} tone` : "",
    p.timezone?.trim() ?? "",
    `profile ${p.profile}`,
  ].filter(Boolean);
  const name = p.name?.trim() ?? "";
  if (!name) {
    return {
      headline: "Persona saved without a name",
      tone: "warn",
      meta,
      detail: 'The prompt falls back to calling the operator "you"; give it a name below.',
    };
  }
  const bases = Array.isArray(p.always_on_kbs) ? p.always_on_kbs.length : 0;
  return {
    headline: `Speaking as ${name}`,
    tone: "ok",
    meta,
    detail:
      bases > 0
        ? `Always searches ${bases} knowledge ${bases === 1 ? "base" : "bases"} on chats from this console.`
        : undefined,
  };
}

export type KbUnavailable = "kb_disabled" | "kb_not_configured";

/** The two gateway codes for a Knowledge Base that exists but cannot list groups. */
export function kbUnavailableCode(e: unknown): KbUnavailable | null {
  if (!(e instanceof ApiError)) return null;
  const code = (e.body as { error?: unknown } | null)?.error;
  return code === "kb_disabled" || code === "kb_not_configured" ? code : null;
}

export type KbBlock =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "no-key" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "list"; groups: KbGroup[] };

export function kbBlockState(input: {
  loading: boolean;
  error: string | null;
  data: KbGroup[] | { unavailable: KbUnavailable } | null;
}): KbBlock {
  if (input.loading) return { kind: "loading" };
  if (input.error) return { kind: "error", message: input.error };
  const d = input.data;
  if (!d) return { kind: "empty" };
  if (!Array.isArray(d)) return d.unavailable === "kb_disabled" ? { kind: "off" } : { kind: "no-key" };
  return d.length === 0 ? { kind: "empty" } : { kind: "list", groups: d };
}
