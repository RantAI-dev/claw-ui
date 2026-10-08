import { MEMORY_CATEGORIES, type SessionSummary } from "@/lib/types";
import { isGeneratedMemoryKey } from "@/lib/recalled-memories";

/**
 * A name the console cannot address afterwards: the proxy that fronts the
 * gateway refuses a decoded path separator in any segment (a traversal guard),
 * so `DELETE /memory/<name>` never leaves the console for such a key.
 */
export function hasSeparator(name: string): boolean {
  return /[/\\]/.test(name);
}

export const NAME_SEPARATOR_MESSAGE = "A name cannot contain / or \\.";

/** The one way to remove a key this console cannot address. */
export function forgetFromTerminal(key: string): string {
  return `rantaiclaw memory clear --key ${JSON.stringify(key)} --yes`;
}

export function rememberToast(input: {
  key: string;
  named: boolean;
  replaced: boolean;
  notes: string[];
}): string {
  const head = input.replaced
    ? `Replaced ${input.key}`
    : input.named
      ? `Remembered as ${input.key}`
      : "Remembered";
  if (input.notes.length === 0) return head;
  const joined = input.notes.join("; ");
  return `${head}. ${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

/**
 * A key the runtime wrote on its own (`user_msg_<uuid>`, `assistant_resp_<uuid>`),
 * as opposed to the `memory_<uuid>` the API generates for an unnamed save.
 */
export function isAutoSavedKey(key: string): boolean {
  return isGeneratedMemoryKey(key) && !/^memory_/i.test(key);
}

export function originWords(entry: { key: string; session_id: string | null }): string | null {
  const auto = isAutoSavedKey(entry.key);
  const scoped = !!entry.session_id;
  if (auto) return scoped ? "saved from this conversation" : "saved from a conversation";
  if (scoped) return "this conversation only";
  return null;
}

export function emptyCopy(input: { query: string; filter: string; place?: string }): {
  title: string;
  hint: string;
  action: "clear-search" | "clear-filter" | "clear-place" | null;
} {
  const q = input.query.trim();
  const f = input.filter.trim();
  if (q) {
    return {
      title: `No memories match “${q}”.`,
      hint: "Try fewer or different words.",
      action: "clear-search",
    };
  }
  if (f) {
    return {
      title: `No ${f} memories.`,
      hint: "Pick another category, or show all.",
      action: "clear-filter",
    };
  }
  if (input.place) {
    return {
      title: "No notes in this place.",
      hint: "Pick another place, or show all.",
      action: "clear-place",
    };
  }
  return {
    title: "No memories yet.",
    hint: "Add one above. Conversations are saved here too when auto-save is on.",
    action: null,
  };
}

/** Built-ins first, then every other category on screen or selected, once each. */
export function categoryOptions(present: readonly string[], selected: string): string[] {
  const out: string[] = [...MEMORY_CATEGORIES];
  for (const raw of [...present, selected]) {
    const c = raw.trim();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function parseMs(ts: number | string | null | undefined): number | null {
  if (ts == null) return null;
  let ms = typeof ts === "string" ? Number(ts) : ts;
  if (typeof ts === "string" && !Number.isFinite(ms)) ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  // Ten-digit values are seconds.
  if (ms < 1e12) ms *= 1000;
  return ms;
}

export function absoluteTime(ts: number | string | null | undefined): string | null {
  const ms = parseMs(ts);
  return ms === null ? null : new Date(ms).toLocaleString();
}

export function isoTime(ts: number | string | null | undefined): string | null {
  const ms = parseMs(ts);
  return ms === null ? null : new Date(ms).toISOString();
}

export interface MemoryVerdict {
  headline: string;
  tone: "ok" | "warn";
  /** The mono meta line under the headline, cron-band style. */
  meta: string[];
  detail?: string;
}

/**
 * MEMORY.md usage as `used / max` characters. `chars` counts the private core
 * notes before the cut, so it can pass the maximum; that is the over-cap case.
 * Null unless the gateway sent both numbers.
 */
export function memoryUsage(
  chars: number | undefined,
  max: number | undefined,
): { text: string; over: boolean } | null {
  if (typeof chars !== "number" || typeof max !== "number") return null;
  return { text: `MEMORY.md ${chars} / ${max} characters`, over: chars > max };
}

function noteCount(n: number, kind: string): string {
  return `${n} ${kind} ${n === 1 ? "note" : "notes"}`;
}

/**
 * The answer the page opens with: what will the agent recall on its next turn?
 * A backend that fails its health check outranks every count — the entries may
 * exist, but nothing reaches a prompt until it recovers. The placement fields
 * come from newer gateways; each one is worded only when it was sent.
 */
export function memoryVerdict(stats: {
  backend: string;
  total_entries: number;
  healthy: boolean;
  mode?: string;
  private_entries?: number;
  conversation_entries?: number;
  memory_md_chars?: number;
  memory_md_max_chars?: number;
}): MemoryVerdict {
  const meta = [`${stats.backend} backend`];
  if (typeof stats.private_entries === "number") {
    meta.push(noteCount(stats.private_entries, "private"));
  }
  if (typeof stats.conversation_entries === "number") {
    meta.push(noteCount(stats.conversation_entries, "conversation"));
  }
  if (stats.mode) meta.push(`${stats.mode} search`);
  const usage = memoryUsage(stats.memory_md_chars, stats.memory_md_max_chars);
  if (usage) meta.push(usage.text);
  if (!stats.healthy) {
    return {
      headline: "Recall isn't working",
      tone: "warn",
      meta,
      detail:
        "The memory backend failed its health check; the agent recalls nothing until it recovers.",
    };
  }
  if (stats.total_entries === 0) {
    return {
      headline: "Nothing on recall yet",
      tone: "warn",
      meta,
      detail:
        "Remember the first fact, or chat: the agent saves turns on its own when auto-save is on.",
    };
  }
  const n = stats.total_entries;
  const headline = `${n} ${n === 1 ? "memory" : "memories"} on recall`;
  if (usage?.over) {
    return {
      headline,
      tone: "warn",
      meta,
      detail: "MEMORY.md is over its limit, so the oldest notes are left out of the prompt file.",
    };
  }
  return { headline, tone: "ok", meta };
}

interface Placement {
  surface?: string | null;
  place?: string | null;
  thread?: string | null;
}

/** `surface · place · thread x`, leaving out whatever is empty. */
function joinPlacement(p: Placement): string {
  return [p.surface, p.place, p.thread ? `thread ${p.thread}` : null]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/**
 * Where a note lives, in the gateway's own words. A conversation note has a
 * `surface`. A private note has no session and arrives with `surface`, `place`
 * and `thread` all null. Anything else, an older gateway or a session id that
 * is not a channel conversation (a TUI or web session), is null here so the
 * caller falls back to `originWords`.
 */
export function placeLabel(entry: Placement & { session_id?: string | null }): string | null {
  if (typeof entry.surface === "string" && entry.surface) return joinPlacement(entry);
  const sent = entry.surface !== undefined || entry.place !== undefined || entry.thread !== undefined;
  return sent && !entry.session_id ? "Private" : null;
}

/**
 * What a note row says about its origin: the gateway's place when it sent one
 * (an auto-saved private note keeps its "saved from a conversation" hint),
 * otherwise the wording derived from the session id.
 */
export function rowOrigin(
  entry: Placement & { key: string; session_id?: string | null },
): string | null {
  const label = placeLabel(entry);
  const words = originWords({ key: entry.key, session_id: entry.session_id ?? null });
  if (label === null) return words;
  if (label === "Private" && words) return `${label} · ${words}`;
  return label;
}

/**
 * One option per conversation that has notes on the page, once each, plus the
 * selected conversation when it is not on the page. "Private" is a fixed
 * choice of the picker, not an option here.
 */
export function placeOptions(
  entries: readonly (Placement & { session_id: string | null })[],
  selected: string,
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const e of entries) {
    if (!e.session_id || !e.surface) continue;
    if (out.some((o) => o.value === e.session_id)) continue;
    out.push({ value: e.session_id, label: placeLabel(e) ?? e.session_id });
  }
  if (selected && selected !== "private" && !out.some((o) => o.value === selected)) {
    out.push({ value: selected, label: selected });
  }
  return out;
}

export interface RecordingGroup {
  /** The conversation key; a recording without one stands alone under its id. */
  key: string;
  label: string;
  /** Newest activity first, as the gateway sent them. */
  recordings: SessionSummary[];
}

/** Where a recorded conversation took place: the surface, the place and the thread. */
export function recordingPlace(s: SessionSummary): string {
  return joinPlacement(s) || (s.conversation_key ?? "Unknown conversation");
}

/**
 * Channel recordings grouped by conversation, in the order each conversation
 * first appears. Every `/new` adds a session under the same key, so one
 * conversation can have several rows. A row whose `source` is not `channel`
 * is dropped: an older gateway ignores the `source` parameter and answers
 * with ordinary chat sessions.
 */
export function groupRecordings(sessions: readonly SessionSummary[]): RecordingGroup[] {
  const groups = new Map<string, RecordingGroup>();
  for (const s of sessions) {
    if (s.source !== "channel") continue;
    const key = s.conversation_key || s.id;
    const group = groups.get(key);
    if (group) group.recordings.push(s);
    else groups.set(key, { key, label: recordingPlace(s), recordings: [s] });
  }
  return [...groups.values()];
}

export const RECORDINGS_EMPTY = {
  title: "No chat recordings yet.",
  hint: "Recordings come from channel conversations and are kept thirty days after the last message.",
};

export const CONVERSATION_BUSY_MESSAGE =
  "The agent is answering in that conversation. Try again in a moment.";

export function deleteConversationText(label: string): string {
  return `Every recording of the conversation in ${label} is removed. Notes and scheduled jobs made in it stay.`;
}

export function removedToast(count: number | undefined): string {
  if (count === undefined) return "Conversation deleted";
  return `Removed ${count} ${count === 1 ? "recording" : "recordings"}`;
}
