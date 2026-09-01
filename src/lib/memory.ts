import { MEMORY_CATEGORIES } from "@/lib/types";
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

export function emptyCopy(input: { query: string; filter: string }): {
  title: string;
  hint: string;
  action: "clear-search" | "clear-filter" | null;
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
